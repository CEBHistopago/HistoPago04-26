'use server';
/**
 * @fileOverview Flow for generating a monthly invoice for a vendor.
 * - generateMonthlyInvoice: Calculates billing based on active credits and sends an email.
 * - Logic: Charges for ALL credits created in the month (even if suspended).
 * - Logic: Charges for legacy credits ONLY if they are active (not paid and not administratively closed).
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CollectionReference, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { Vendor, CreditSale, Payment, Invoice, InvoiceItem } from '@/lib/data';
import { startOfMonth, endOfMonth, format, subMonths, isValid } from 'date-fns';
import { sendReminderEmail } from './send-reminder-email-flow';

const GenerateInvoiceInputSchema = z.object({
    vendorId: z.string(),
    billingDate: z.string().optional().describe("Date for which to bill, defaults to previous month."),
});

const GenerateInvoiceOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    invoiceId: z.string().optional(),
});

export async function generateMonthlyInvoice(input: z.infer<typeof GenerateInvoiceInputSchema>): Promise<z.infer<typeof GenerateInvoiceOutputSchema>> {
    return generateMonthlyInvoiceFlow(input);
}

const generateMonthlyInvoiceFlow = ai.defineFlow({
    name: 'generateMonthlyInvoiceFlow',
    inputSchema: GenerateInvoiceInputSchema,
    outputSchema: GenerateInvoiceOutputSchema,
}, async ({ vendorId, billingDate }) => {
    const { firestore } = await initializeFirebaseAdmin();

    try {
        const targetDate = billingDate ? new Date(billingDate) : new Date();
        const firstDayOfBillingMonth = startOfMonth(subMonths(targetDate, 1));
        const lastDayOfBillingMonth = endOfMonth(subMonths(targetDate, 1));

        const vendorRef = firestore.collection('vendors').doc(vendorId);
        const vendorDoc = await vendorRef.get();
        if (!vendorDoc.exists) throw new Error('Vendor not found.');
        
        const vendor = vendorDoc.data();
        if (!vendor) throw new Error(`Vendor document ${vendorId} has no data.`);
        
        if (vendor.plan === 'HistoAlquiler') {
            return { success: true, message: `Generación omitida para plan HistoAlquiler` };
        }

        const salesSnapshot = await vendorRef.collection('sales').get();
        
        let newCreditsCount = 0;
        let legacyCreditsCount = 0;
        const activeCreditsList: string[] = [];

        for (const saleDoc of salesSnapshot.docs) {
            try {
                const sale = { id: saleDoc.id, ...saleDoc.data() } as CreditSale;

                const saleAmount = parseFloat(sale.amount as any);
                if (isNaN(saleAmount) || saleAmount <= 0) continue;

                const saleDate = sale.saleDate?.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate as any);
                if (!isValid(saleDate)) continue;

                // Si la venta es posterior al período de facturación, la ignoramos.
                if (saleDate > lastDayOfBillingMonth) continue;

                // CASO 1: VENTA NUEVA DEL PERÍODO
                // Se cobra siempre, incluso si se suspendió después (Cerrado Administrativamente)
                // porque el cargo es por la creación/registro inicial.
                if (saleDate >= firstDayOfBillingMonth && saleDate <= lastDayOfBillingMonth) {
                    newCreditsCount++;
                    activeCreditsList.push(sale.invoiceNumber);
                    continue;
                }

                // CASO 2: CRÉDITOS DE MESES ANTERIORES
                // Solo se cobran si siguen activos (tienen saldo) Y NO han sido cerrados administrativamente.
                if (saleDate < firstDayOfBillingMonth) {
                    // Si ya fue cerrado administrativamente antes de este mes, no se cobra gestión.
                    if (sale.status === 'Cerrado Administrativamente') continue;

                    const paymentsSnapshot = await saleDoc.ref.collection('payments')
                        .where('status', '==', 'Verificado')
                        .get();

                    const downPaymentAmount = typeof sale.downPaymentAmount === 'number' ? sale.downPaymentAmount : 0;
                    
                    const paidBeforePeriod = paymentsSnapshot.docs.reduce((sum, doc) => {
                        const p = doc.data();
                        const pDate = p.paymentDate.toDate ? p.paymentDate.toDate() : new Date(p.paymentDate);
                        if (pDate < firstDayOfBillingMonth) {
                            return sum + (typeof p.amount === 'number' ? p.amount : 0);
                        }
                        return sum;
                    }, 0);

                    // Si tenía saldo al inicio del mes, se cobra la gestión de ese mes.
                    if ((paidBeforePeriod + downPaymentAmount) < saleAmount - 0.01) {
                         legacyCreditsCount++;
                         activeCreditsList.push(sale.invoiceNumber);
                    }
                }

            } catch (saleError: any) {
                console.error(`Error procesando venta ${saleDoc.id} para factura.`, saleError);
            }
        }
        
        const baseFee = 7.00;
        const usageFee = 0.33;
        
        const newCreditsTotal = newCreditsCount * usageFee;
        const legacyCreditsTotal = legacyCreditsCount * usageFee;
        const finalTotal = baseFee + newCreditsTotal + legacyCreditsTotal;
        
        const invoiceItems: InvoiceItem[] = [
            { 
                description: 'Tarifa Base Mensual HistoPago', 
                quantity: 1, 
                unitPrice: baseFee, 
                total: baseFee 
            },
            { 
                description: `Ventas Nuevas del Período (${newCreditsCount})`, 
                quantity: newCreditsCount, 
                unitPrice: usageFee, 
                total: newCreditsTotal 
            },
            { 
                description: `Créditos de Meses Anteriores Activos (${legacyCreditsCount})`, 
                quantity: legacyCreditsCount, 
                unitPrice: usageFee, 
                total: legacyCreditsTotal 
            }
        ];

        const invoiceRef = vendorRef.collection('invoices').doc();
        const newInvoice: Omit<Invoice, 'id'> = {
            vendorId,
            invoiceDate: Timestamp.now(),
            periodStart: Timestamp.fromDate(firstDayOfBillingMonth),
            periodEnd: Timestamp.fromDate(lastDayOfBillingMonth),
            status: 'Pendiente',
            items: invoiceItems,
            totalAmount: finalTotal,
            activeCreditsList: activeCreditsList,
        };
        await invoiceRef.set(newInvoice);
        
        const invoiceTableHtml = `
            <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
                <thead>
                    <tr style="background-color: #f3f4f6;">
                        <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: left;">Descripción</th>
                        <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: center;">Cant.</th>
                        <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: right;">Unitario</th>
                        <th style="border: 1px solid #e5e7eb; padding: 12px; text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoiceItems.filter(item => item.quantity > 0 || item.description.includes('Base')).map(item => `
                        <tr>
                            <td style="border: 1px solid #e5e7eb; padding: 12px;">${item.description}</td>
                            <td style="border: 1px solid #e5e7eb; padding: 12px; text-align: center;">${item.quantity}</td>
                            <td style="border: 1px solid #e5e7eb; padding: 12px; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
                            <td style="border: 1px solid #e5e7eb; padding: 12px; text-align: right;">$${item.total.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        await sendReminderEmail({
            to: vendor.email,
            vendorName: vendor.name,
            emailType: 'monthlyInvoice',
            period: format(firstDayOfBillingMonth, 'MMMM yyyy'),
            invoiceDate: format(new Date(), 'dd/MM/yyyy'),
            invoiceTable: invoiceTableHtml,
            totalAmount: finalTotal,
        });

        return { success: true, message: `Factura generada y enviada a ${vendor.name}`, invoiceId: invoiceRef.id };
    } catch (error: any) {
        console.error(`Fallo al generar factura para comercio ${vendorId}:`, error);
        return { success: false, message: error.message };
    }
});
