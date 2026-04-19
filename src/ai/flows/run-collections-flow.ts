'use server';
/**
 * @fileOverview A scheduled flow to run automated collections tasks.
 * - runAutomatedCollections: Fetches all active vendors, checks for upcoming/due installments, and sends reminders.
 * - Frecuencia personalizada: El mensaje amistoso se envía según la preferencia del comercio (1-7 días antes).
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CollectionReference, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { Vendor, CreditSale, Payment } from '@/lib/data';
import { addWeeks, addMonths, addQuarters, differenceInDays, startOfDay, format, addDays } from 'date-fns';
import { sendReminderEmail } from './send-reminder-email-flow';
import { sendSms } from './send-general-sms-flow';
import { sendWhatsApp } from './send-whatsapp-flow';
import { sendPushNotification } from './send-push-notification-flow';

const RunCollectionsInputSchema = z.object({
    scheduleTime: z.string().optional(),
});

const RunCollectionsOutputSchema = z.object({
    vendorsScanned: z.number(),
    salesProcessed: z.number(),
    remindersSent: z.number(),
    errors: z.array(z.string()),
});

export async function runAutomatedCollections(input?: z.infer<typeof RunCollectionsInputSchema>): Promise<z.infer<typeof RunCollectionsOutputSchema>> {
  return runAutomatedCollectionsFlow(input || {});
}

const runAutomatedCollectionsFlow = ai.defineFlow(
  {
    name: 'runAutomatedCollectionsFlow',
    inputSchema: RunCollectionsInputSchema,
    outputSchema: RunCollectionsOutputSchema,
  },
  async ({ scheduleTime }) => {
    const { firestore } = await initializeFirebaseAdmin();
    
    const now = scheduleTime ? new Date(scheduleTime) : new Date();
    const today = startOfDay(now);

    let vendorsScanned = 0;
    let salesProcessed = 0;
    let remindersSent = 0;
    const errors: string[] = [];
    
    const whatsAppConfigured = !!process.env.TWILIO_WHATSAPP_TEMPLATE_REMINDER_SID && !!process.env.TWILIO_WHATSAPP_TEMPLATE_OVERDUE_SID;

    try {
        const vendorsQuery = firestore.collection('vendors').where('status', '==', 'Activo');
        const vendorsSnapshot = await vendorsQuery.get();

        if (vendorsSnapshot.empty) {
            return { vendorsScanned, salesProcessed, remindersSent, errors };
        }
        
        const activeVendors: { id: string, data: Vendor, ref: any }[] = [];
        for (const doc of vendorsSnapshot.docs) {
            vendorsScanned++;
            const data = doc.data() as Vendor;
            
            const expiryDate = data.subscriptionEndDate?.toDate 
                ? data.subscriptionEndDate.toDate() 
                : (data.subscriptionEndDate ? new Date(data.subscriptionEndDate) : null);
            
            if (expiryDate && expiryDate < today) {
                await doc.ref.update({ status: 'Inactivo' });
                continue;
            }
            
            activeVendors.push({ id: doc.id, data, ref: doc.ref });
        }

        if (activeVendors.length === 0) {
            return { vendorsScanned, salesProcessed, remindersSent, errors };
        }
        
        const allCustomerIdentifications = new Set<string>();
        const allSalesByVendor: { [vendorId: string]: CreditSale[] } = {};

        for (const vendor of activeVendors) {
            const salesRef = vendor.ref.collection('sales');
            const salesSnapshot = await salesRef.where('status', 'in', ['Pendiente', 'Vencido']).get();
            const sales = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreditSale));
            allSalesByVendor[vendor.id] = sales;
            sales.forEach(sale => allCustomerIdentifications.add(sale.customerIdentification));
        }

        const customerUidMap = new Map<string, string>();
        if (allCustomerIdentifications.size > 0) {
            const ids = Array.from(allCustomerIdentifications);
            const chunks = [];
            for (let i = 0; i < ids.length; i += 30) {
                chunks.push(ids.slice(i, i + 30));
            }
            for (const chunk of chunks) {
                if (chunk.length === 0) continue;
                const customerQuery = firestore.collection('customers').where('identificationNumber', 'in', chunk);
                const customerSnapshot = await customerQuery.get();
                customerSnapshot.forEach(doc => {
                    const customerData = doc.data();
                    if (customerData.identificationNumber) {
                        customerUidMap.set(customerData.identificationNumber, doc.id);
                    }
                });
            }
        }
        
        for (const vendorObj of activeVendors) {
            const vendor = vendorObj.data;
            const vendorId = vendorObj.id;
            const vendorDocRef = vendorObj.ref;
            const vendorSales = allSalesByVendor[vendorId] || [];
            
            // Frecuencia personalizada para recordatorios amistosos
            const reminderDaysBefore = vendor.reminderDaysBefore || 2;

            const dailyStats = {
                clientsContacted: new Set<string>(),
                notifications: { whatsapp: 0, sms: 0, email: 0, push: 0 },
            };

            for (const sale of vendorSales) {
                salesProcessed++;
                
                try {
                    if (!sale.firstPaymentDate || !sale.dueDate) continue;

                    const paymentsCollectionRef = vendorDocRef.collection('sales').doc(sale.id).collection('payments') as CollectionReference<Payment>;
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
                        const daysUntilDue = differenceInDays(dueDateStart, today);
                        const daysOverdue = differenceInDays(today, dueDateStart);
                        const isOverdue = dueDateStart < today;
                        
                        const customerUid = customerUidMap.get(sale.customerIdentification);

                        // 1. RECORDATORIO AMISTOSO (Días personalizados según el comercio)
                        if (daysUntilDue === reminderDaysBefore) { 
                            if (sale.customerPhone) {
                                if (whatsAppConfigured) {
                                    await sendWhatsApp({
                                        customerName: sale.customerName,
                                        customerPhone: sale.customerPhone,
                                        vendorName: vendor.name,
                                        messageType: 'reminder',
                                        dueAmount: pendingOnInstallment,
                                        invoiceNumber: sale.invoiceNumber,
                                        dueDate: format(dueDateStart, 'dd/MM/yyyy'),
                                    }).catch(() => null);
                                    dailyStats.notifications.whatsapp++;
                                } else {
                                     await sendSms({
                                        customerName: sale.customerName,
                                        customerPhone: sale.customerPhone,
                                        vendorName: vendor.name,
                                        messageType: 'reminder',
                                        dueAmount: pendingOnInstallment,
                                        invoiceNumber: sale.invoiceNumber,
                                     }).catch(() => null);
                                     dailyStats.notifications.sms++;
                                }
                                remindersSent++;
                                dailyStats.clientsContacted.add(sale.customerIdentification);
                                await new Promise(r => setTimeout(r, 20));
                            }
                            
                            if (sale.customerEmail) {
                                await sendReminderEmail({
                                    to: sale.customerEmail,
                                    vendorName: vendor.name,
                                    vendorEmail: vendor.email,
                                    emailType: 'reminder',
                                    customerName: sale.customerName,
                                    dueAmount: pendingOnInstallment,
                                    dueDate: format(dueDateStart, 'dd/MM/yyyy'),
                                    invoiceNumber: sale.invoiceNumber,
                                }).catch(() => null);
                                dailyStats.notifications.email++;
                                remindersSent++;
                                dailyStats.clientsContacted.add(sale.customerIdentification);
                                // THROTTLING: 350ms delay (~2.8 emails/sec)
                                await new Promise(r => setTimeout(r, 350));
                            }
                        }

                        // 2. ALERTA DE ATRASO (1 día después del vencimiento)
                        if (isOverdue && daysOverdue === 1) { 
                            if (sale.customerPhone) {
                                if (whatsAppConfigured) {
                                    await sendWhatsApp({
                                        customerName: sale.customerName,
                                        customerPhone: sale.customerPhone,
                                        vendorName: vendor.name,
                                        messageType: 'overdue',
                                        dueAmount: pendingOnInstallment,
                                        invoiceNumber: sale.invoiceNumber,
                                        dueDate: format(dueDateStart, 'dd/MM/yyyy'),
                                    }).catch(() => null);
                                    dailyStats.notifications.whatsapp++;
                                } else {
                                     await sendSms({
                                        customerName: sale.customerName,
                                        customerPhone: sale.customerPhone,
                                        vendorName: vendor.name,
                                        messageType: 'overdue',
                                        dueAmount: pendingOnInstallment,
                                        invoiceNumber: sale.invoiceNumber,
                                     }).catch(() => null);
                                     dailyStats.notifications.sms++;
                                }
                                remindersSent++;
                                dailyStats.clientsContacted.add(sale.customerIdentification);
                                await new Promise(r => setTimeout(r, 20));
                            }
                            
                            if (sale.customerEmail) {
                                await sendReminderEmail({
                                    to: sale.customerEmail,
                                    vendorName: vendor.name,
                                    vendorEmail: vendor.email,
                                    emailType: 'overdue',
                                    customerName: sale.customerName,
                                    dueAmount: pendingOnInstallment,
                                    dueDate: format(dueDateStart, 'dd/MM/yyyy'),
                                    invoiceNumber: sale.invoiceNumber,
                                }).catch(() => null);
                                dailyStats.notifications.email++;
                                remindersSent++;
                                dailyStats.clientsContacted.add(sale.customerIdentification);
                                // THROTTLING: 350ms delay
                                await new Promise(r => setTimeout(r, 350));
                            }
                        }

                        // 3. PUSH VENCE HOY (Solo app)
                        if (daysUntilDue === 0 && customerUid) { 
                            await sendPushNotification({
                                userId: customerUid,
                                collectionName: 'customers',
                                title: 'Tu cuota vence hoy',
                                body: `La cuota de $${pendingOnInstallment.toFixed(2)} de tu crédito con ${vendor.name} vence hoy. ¡No lo olvides!`,
                                link: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/customer/commitments`
                            }).catch(() => null);
                            dailyStats.notifications.push++;
                            remindersSent++;
                            dailyStats.clientsContacted.add(sale.customerIdentification);
                        }
                    }
                } catch (e: any) {
                    errors.push(`Error en venta ${sale.id} de ${vendorId}: ${e.message}`);
                }
            }

            try {
                const dailyStatsRef = vendorDocRef.collection('daily_management_stats').doc(format(today, 'yyyy-MM-dd'));
                await firestore.runTransaction(async (transaction) => {
                    const statsDoc = await transaction.get(dailyStatsRef);
                    if (!statsDoc.exists) {
                        transaction.set(dailyStatsRef, {
                            contactedClientIds: Array.from(dailyStats.clientsContacted),
                            notifications: dailyStats.notifications,
                            updatedAt: Timestamp.now(),
                        });
                    } else {
                        const updatePayload: { [key: string]: any } = {
                            'notifications.whatsapp': FieldValue.increment(dailyStats.notifications.whatsapp),
                            'notifications.sms': FieldValue.increment(dailyStats.notifications.sms),
                            'notifications.email': FieldValue.increment(dailyStats.notifications.email),
                            'notifications.push': FieldValue.increment(dailyStats.notifications.push),
                            updatedAt: Timestamp.now(),
                        };
                        if (dailyStats.clientsContacted.size > 0) {
                            updatePayload.contactedClientIds = FieldValue.arrayUnion(...Array.from(dailyStats.clientsContacted));
                        }
                        transaction.update(dailyStatsRef, updatePayload);
                    }
                });
            } catch (e: any) {
                 errors.push(`Error estadísticas para ${vendorId}: ${e.message}`);
            }
        }

        return { vendorsScanned, salesProcessed, remindersSent, errors };

    } catch (error: any) {
      throw new Error(`CRON Flow falló: ${error.message}`);
    }
  }
);
