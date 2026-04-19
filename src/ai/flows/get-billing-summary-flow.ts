'use server';
/**
 * @fileOverview Flow for generating a billing summary for all vendors.
 * - getBillingSummary: Calculates the estimated billable amount for each vendor for a specific month.
 * - Logic: Includes "New" credits even if suspended in the same month.
 * - Logic: Excludes "Legacy" credits if they were suspended in previous months.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CollectionReference, Timestamp } from 'firebase-admin/firestore';
import { Vendor, CreditSale, Payment, BillingSummarySchema, BillingSummary, BillingSummaryItem } from '@/lib/data';
import { startOfMonth, endOfMonth, isValid, parseISO } from 'date-fns';

const BillingSummaryInputSchema = z.object({
    billingDate: z.string().optional().describe("Date for which to calculate the billing summary, defaults to the current month."),
});

export async function getBillingSummary(input?: z.infer<typeof BillingSummaryInputSchema>): Promise<BillingSummary> {
    return getBillingSummaryFlow(input || {});
}

const getBillingSummaryFlow = ai.defineFlow({
    name: 'getBillingSummaryFlow',
    inputSchema: BillingSummaryInputSchema,
    outputSchema: BillingSummarySchema,
}, async ({ billingDate }) => {
    const { firestore } = await initializeFirebaseAdmin();

    try {
        let targetDate = new Date();
        if (billingDate) {
            targetDate = billingDate.includes('-') && billingDate.length === 7 
                ? new Date(`${billingDate}-02`) 
                : new Date(billingDate);
        }
        
        if (!isValid(targetDate)) targetDate = new Date();

        const firstDayOfBillingMonth = startOfMonth(targetDate);
        const lastDayOfBillingMonth = endOfMonth(targetDate);
        
        const vendorsSnapshot = await firestore.collection('vendors').get();
        if (vendorsSnapshot.empty) {
            return [];
        }

        const summaryItems: BillingSummaryItem[] = [];

        const vendorPromises = vendorsSnapshot.docs.map(async (vendorDoc) => {
             try {
                const vendor = vendorDoc.data() as Vendor;
                
                const normalizedPlan = vendor.plan === 'HistoAlquiler' ? 'HistoAlquiler' : 'HistoGestion';
                if (normalizedPlan !== 'HistoGestion') return null;

                const salesSnapshot = await vendorDoc.ref.collection('sales').get();
                if (salesSnapshot.empty) return null;

                const activityResults = await Promise.all(salesSnapshot.docs.map(async (saleDoc): Promise<{ isNew: boolean, isActive: boolean }> => {
                    try {
                        const sale = { id: saleDoc.id, ...saleDoc.data() } as CreditSale;
                        
                        const saleAmount = parseFloat(sale.amount as any);
                        if (isNaN(saleAmount) || saleAmount <= 0) return { isNew: false, isActive: false };
                        
                        const saleDate = sale.saleDate?.toDate ? sale.saleDate.toDate() : new Date(sale.saleDate as any);
                        if (!isValid(saleDate)) return { isNew: false, isActive: false };

                        // Caso 1: Crédito creado durante el mes de facturación.
                        // Se cobra SIEMPRE (incluso si se suspende en el mismo mes).
                        if (saleDate >= firstDayOfBillingMonth && saleDate <= lastDayOfBillingMonth) {
                            return { isNew: true, isActive: true };
                        }

                        // Caso 2: Crédito creado antes del mes de facturación.
                        if (saleDate < firstDayOfBillingMonth) {
                            // Si ya está cerrado administrativamente, deja de generar cargos de gestión mensuales.
                            if (sale.status === 'Cerrado Administrativamente') {
                                return { isNew: false, isActive: false };
                            }

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
                            
                            // Solo es "activo" si tenía saldo pendiente al inicio del mes.
                            if ((paidBeforePeriod + downPaymentAmount) < saleAmount - 0.01) {
                                return { isNew: false, isActive: true };
                            }
                        }
                        
                        return { isNew: false, isActive: false };
                    } catch (saleError) {
                        return { isNew: false, isActive: false };
                    }
                }));
                
                const newCredits = activityResults.filter(r => r.isNew).length;
                const activeLegacyCredits = activityResults.filter(r => !r.isNew && r.isActive).length;
                const totalActiveCredits = newCredits + activeLegacyCredits;

                if (totalActiveCredits > 0) {
                    const baseFee = 7.00;
                    const usageFee = 0.33;
                    const variableAmount = totalActiveCredits * usageFee;
                    const billableAmount = baseFee + variableAmount;

                    return {
                        vendorId: vendorDoc.id,
                        vendorName: vendor.name || 'Comercio Sin Nombre',
                        newCredits,
                        activeLegacyCredits,
                        activeCredits: totalActiveCredits,
                        baseFee,
                        variableAmount,
                        billableAmount,
                    };
                }
                return null;
            } catch (vendorError) {
                 return null;
            }
        });
        
        const results = await Promise.all(vendorPromises);
        const validResults = results.filter((item): item is BillingSummaryItem => item !== null);

        return validResults.sort((a, b) => b.billableAmount - a.billableAmount);

    } catch (error: any) {
        console.error(`Error general al generar resumen de facturación:`, error);
        throw new Error('No se pudo generar el resumen de facturación.');
    }
});
