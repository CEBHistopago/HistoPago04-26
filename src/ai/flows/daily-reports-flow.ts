
'use server';
/**
 * @fileOverview A scheduled flow to send daily overdue/due-today reports to vendors.
 * - sendDailyReports: Fetches vendors who opted-in, calculates their overdue items, and sends an email.
 * - Throttling adjusted to ~2.8 emails/sec (350ms delay) to respect Resend quota.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CollectionReference, Timestamp } from 'firebase-admin/firestore';
import { Vendor, CreditSale, Payment } from '@/lib/data';
import { addWeeks, addMonths, addQuarters, startOfDay, isSameDay, format, differenceInDays } from 'date-fns';
import { sendReminderEmail } from './send-reminder-email-flow';
import { sendPushNotification } from './send-push-notification-flow';

const DailyReportsInputSchema = z.object({
    scheduleTime: z.string().optional(),
});

const DailyReportsOutputSchema = z.object({
    vendorsScanned: z.number(),
    reportsGenerated: z.number(),
    emailsSent: z.number(),
    errors: z.array(z.string()),
});

export async function sendDailyReports(input?: z.infer<typeof DailyReportsInputSchema>): Promise<z.infer<typeof DailyReportsOutputSchema>> {
  return sendDailyReportsFlow(input || {});
}

const sendDailyReportsFlow = ai.defineFlow(
  {
    name: 'sendDailyReportsFlow',
    inputSchema: DailyReportsInputSchema,
    outputSchema: DailyReportsOutputSchema,
  },
  async ({ scheduleTime }) => {
    const { firestore } = await initializeFirebaseAdmin();
    
    const now = scheduleTime ? new Date(scheduleTime) : new Date();
    const today = startOfDay(now);

    let vendorsScanned = 0;
    let reportsGenerated = 0;
    let emailsSent = 0;
    const errors: string[] = [];

    try {
        // 1. Get all active vendors who have opted-in for the daily report.
        const vendorsQuery = firestore.collection('vendors')
            .where('status', '==', 'Activo')
            .where('enableDailyReport', '==', true);
        
        const vendorsSnapshot = await vendorsQuery.get();

        if (vendorsSnapshot.empty) {
            return { vendorsScanned, reportsGenerated, emailsSent, errors };
        }

        // 2. Process each vendor.
        for (const vendorDoc of vendorsSnapshot.docs) {
            vendorsScanned++;
            const vendor = { id: vendorDoc.id, ...vendorDoc.data() } as Vendor;
            
            // SEGURIDAD: Verificar correo válido
            if (!vendor.email || !vendor.email.includes('@')) {
                errors.push(`Comercio ${vendor.name} (${vendor.id}) no tiene un correo válido.`);
                continue;
            }

            // SEGURIDAD: Verificar fecha de vencimiento real
            const expiryDate = vendor.subscriptionEndDate?.toDate 
                ? vendor.subscriptionEndDate.toDate() 
                : (vendor.subscriptionEndDate ? new Date(vendor.subscriptionEndDate) : null);
            
            if (expiryDate && expiryDate < today) {
                // Si la suscripción ya pasó el hoy, mover a Inactivo y saltar el reporte
                await vendorDoc.ref.update({ status: 'Inactivo' });
                console.log(`[DAILY_REPORT] Skipping vendor ${vendor.id} - Subscription Expired.`);
                continue;
            }

            const overdueInstallments = [];
            let totalOverdueAmount = 0;
            const overdueClients = new Set<string>();

            try {
                const salesRef = vendorDoc.ref.collection('sales');
                const salesSnapshot = await salesRef
                    .where('status', 'in', ['Pendiente', 'Vencido'])
                    .get();
                
                for (const saleDoc of salesSnapshot.docs) {
                    const sale = { id: saleDoc.id, ...saleDoc.data() } as CreditSale;
                    
                    const paymentsCollectionRef = saleDoc.ref.collection('payments') as CollectionReference<Payment>;
                    const verifiedPaymentsSnap = await paymentsCollectionRef.where('status', '==', 'Verificado').get();
                    const verifiedPayments = verifiedPaymentsSnap.docs.map(doc => doc.data());

                    const paymentsByInstallment: Record<number, number> = {};
                     verifiedPayments.forEach(p => {
                        if (!p.appliedToInstallments) return;
                        for (const instNumStr in p.appliedToInstallments) {
                            const installment = parseInt(instNumStr, 10);
                            paymentsByInstallment[installment] = (paymentsByInstallment[installment] || 0) + p.appliedToInstallments[instNumStr];
                        }
                    });
                    
                    if (!sale.firstPaymentDate) continue;

                    const firstPaymentDate = startOfDay(sale.firstPaymentDate.toDate ? sale.firstPaymentDate.toDate() : new Date(sale.firstPaymentDate));

                    for (let i = 1; i <= sale.numberOfInstallments; i++) {
                        const paidForInstallment = paymentsByInstallment[i] || 0;
                        const pendingOnInstallment = sale.installmentAmount - paidForInstallment;

                        if (pendingOnInstallment <= 0.01) continue; 

                        let dueDate: Date;
                        const index = i - 1;
                        switch (sale.paymentFrequency) {
                            case 'Semanal': dueDate = addWeeks(firstPaymentDate, index); break;
                            case 'Quincenal': dueDate = addWeeks(firstPaymentDate, index * 2); break;
                            case 'Mensual': dueDate = addMonths(firstPaymentDate, index); break;
                            case 'Trimestral': dueDate = addQuarters(firstPaymentDate, index); break;
                            default: continue;
                        }
                        
                        const dueDateStart = startOfDay(dueDate);

                        if (dueDateStart <= today) {
                            const daysOverdue = dueDateStart < today ? differenceInDays(today, dueDateStart) : 0;
                            
                            overdueInstallments.push({
                                customerName: sale.customerName,
                                invoiceNumber: sale.invoiceNumber,
                                installmentNumber: i,
                                dueDate: format(dueDateStart, 'dd/MM/yyyy'),
                                daysOverdue: daysOverdue,
                                pendingAmount: pendingOnInstallment,
                            });
                            totalOverdueAmount += pendingOnInstallment;
                            overdueClients.add(sale.customerIdentification);
                        }
                    }
                }

                if (overdueInstallments.length > 0) {
                    reportsGenerated++;
                    overdueInstallments.sort((a, b) => b.daysOverdue - a.daysOverdue);

                    const tableHtml = `
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                            <thead>
                                <tr>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">Cliente</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">Factura</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left; background-color: #f2f2f2;">Vencimiento</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: right; background-color: #f2f2f2;">Días Atraso</th>
                                    <th style="border: 1px solid #ddd; padding: 8px; text-align: right; background-color: #f2f2f2;">Monto Pend.</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${overdueInstallments.map(item => `
                                    <tr>
                                        <td style="border: 1px solid #ddd; padding: 8px;">${item.customerName}</td>
                                        <td style="border: 1px solid #ddd; padding: 8px;">${item.invoiceNumber}</td>
                                        <td style="border: 1px solid #ddd; padding: 8px;">${item.dueDate}</td>
                                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.daysOverdue}</td>
                                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">$${item.pendingAmount.toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;

                    const emailResult = await sendReminderEmail({
                        to: vendor.email, 
                        vendorName: vendor.name,
                        emailType: 'dailyOverdueReport',
                        reportDate: format(today, 'dd/MM/yyyy'),
                        totalOverdueAmount: `$${totalOverdueAmount.toFixed(2)}`,
                        overdueClientsCount: overdueClients.size,
                        overdueInstallmentsTable: tableHtml,
                    });

                    if (emailResult.success) {
                        emailsSent++;
                    } else {
                        errors.push(`Fallo al enviar reporte a ${vendor.email}: ${emailResult.message}`);
                    }
                    
                    await sendPushNotification({
                        userId: vendor.id,
                        collectionName: 'vendors',
                        title: 'Tu Reporte Diario de Cobranza está listo',
                        body: `Tienes ${overdueClients.size} clientes con cuotas vencidas por un total de $${totalOverdueAmount.toFixed(2)}.`,
                        link: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/dashboard/reports`
                    });

                    // --- RATE LIMITING ---
                    // Wait 350ms before next vendor to stay safely under Resend quota
                    await new Promise((resolve) => setTimeout(resolve, 350));
                }
            } catch (e: any) {
                const errorMessage = `Error procesando comercio ${vendor.id}: ${e.message}`;
                console.error(errorMessage);
                errors.push(errorMessage);
            }
        }

        return { vendorsScanned, reportsGenerated, emailsSent, errors };

    } catch (error: any) {
      const errorMessage = `CRON Flow falló: ${error.message}`;
      console.error(errorMessage, error);
      throw new Error(errorMessage);
    }
  }
);
