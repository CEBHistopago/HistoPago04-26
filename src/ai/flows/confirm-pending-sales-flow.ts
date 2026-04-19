'use server';
/**
 * @fileOverview An admin flow to bulk-confirm pending sales for a vendor.
 * - confirmPendingSalesForVendor: Changes the status of all "Pendiente de Confirmación" sales to "Pendiente" and sends notifications.
 * - Optimized to avoid timeouts and handle individual notification failures.
 * - Throttling adjusted to ~3.3 emails/sec (300ms delay) to respect Resend quota.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CreditSale, Vendor } from '@/lib/data';
import { sendReminderEmail } from './send-reminder-email-flow';
import { sendPushNotification } from './send-push-notification-flow';
import { sendWhatsApp } from './send-whatsapp-flow';
import { sendSms } from './send-general-sms-flow';
import { format, isValid } from 'date-fns';


const ConfirmPendingSalesInputSchema = z.object({
  vendorId: z.string().describe("The UID of the vendor whose sales will be confirmed."),
});

const ConfirmPendingSalesOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  confirmedCount: z.number(),
  notificationsSent: z.number(),
});

export async function confirmPendingSalesForVendor(
  input: z.infer<typeof ConfirmPendingSalesInputSchema>
): Promise<z.infer<typeof ConfirmPendingSalesOutputSchema>> {
  return confirmPendingSalesFlow(input);
}

const confirmPendingSalesFlow = ai.defineFlow(
  {
    name: 'confirmPendingSalesFlow',
    inputSchema: ConfirmPendingSalesInputSchema,
    outputSchema: ConfirmPendingSalesOutputSchema,
  },
  async ({ vendorId }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
        const vendorRef = firestore.collection('vendors').doc(vendorId);
        const salesRef = vendorRef.collection('sales');
        
        const [vendorDoc, snapshot] = await Promise.all([
            vendorRef.get(),
            salesRef.where('status', '==', 'Pendiente de Confirmación').get()
        ]);

        if (!vendorDoc.exists) {
            throw new Error('Comercio no encontrado.');
        }
        const vendorData = vendorDoc.data() as Vendor;


        if (snapshot.empty) {
            return { success: true, message: 'No se encontraron ventas pendientes de confirmación.', confirmedCount: 0, notificationsSent: 0 };
        }

        const customerIdentifications = [...new Set(snapshot.docs.map(doc => doc.data().customerIdentification))];
        const customerUidMap = new Map<string, string>();
        
        // Batch query for customer UIDs for push notifications
        if (customerIdentifications.length > 0) {
            const chunks = [];
            for (let i = 0; i < customerIdentifications.length; i += 30) {
                chunks.push(customerIdentifications.slice(i, i + 30));
            }
            for (const chunk of chunks) {
                 if (chunk.length === 0) continue;
                 const customerQuery = firestore.collection('customers').where('identificationNumber', 'in', chunk);
                 const customerSnapshot = await customerQuery.get();
                 customerSnapshot.forEach(doc => {
                    const customer = doc.data();
                    if(customer.identificationNumber) {
                        customerUidMap.set(customer.identificationNumber, doc.id);
                    }
                 });
            }
        }

        // --- 1. DB UPDATE FIRST (FAST) ---
        const bulkWriter = firestore.bulkWriter();
        let confirmedCount = 0;
        for (const doc of snapshot.docs) {
            bulkWriter.update(doc.ref, { status: 'Pendiente' });
            confirmedCount++;
        }
        await bulkWriter.close();

        // --- 2. NOTIFICATIONS (IN BACKGROUND-LIKE PROCESS TO AVOID TIMEOUT) ---
        // Since we are in a server action, we still need to manage the execution time.
        // We process in a non-blocking way where possible, but stay under the Resend/Twilio limits.
        const docsToNotify = snapshot.docs.slice(0, 50); 
        const whatsAppConfigured = !!process.env.TWILIO_WHATSAPP_TEMPLATE_NEWSALE_SID;

        // Use a serial processing for notifications to strictly respect rate limits
        (async () => {
            for (const doc of docsToNotify) {
                const sale = { id: doc.id, ...doc.data() } as CreditSale;
                try {
                    // Email
                    if (sale.customerEmail) {
                        await sendReminderEmail({
                            to: sale.customerEmail,
                            customerName: sale.customerName,
                            vendorName: vendorData.name,
                            vendorEmail: vendorData.email || 'noreply@histopago.com',
                            emailType: 'newSaleConfirmation',
                            invoiceNumber: sale.invoiceNumber,
                            totalAmount: sale.amount,
                        }).catch(e => console.error(`Email failed: ${e.message}`));
                        // RATE LIMITING: Adjusted to ~3.3 emails/sec (300ms delay) to respect Resend quota
                        await new Promise(r => setTimeout(r, 300)); 
                    }

                    // Mobile (WhatsApp/SMS)
                    if (sale.customerPhone) {
                        let mobileSent = false;
                        if (whatsAppConfigured) {
                            const fpdValue = sale.firstPaymentDate;
                            const fpd = fpdValue?.toDate ? fpdValue.toDate() : new Date(fpdValue);
                            
                            const res = await sendWhatsApp({
                                customerName: sale.customerName,
                                customerPhone: sale.customerPhone,
                                vendorName: vendorData.name,
                                messageType: 'newSale',
                                invoiceNumber: sale.invoiceNumber,
                                dueAmount: sale.installmentAmount,
                                dueDate: isValid(fpd) ? format(fpd, 'dd/MM/yyyy') : 'N/A',
                            }).catch(() => ({ success: false }));
                            if (res.success) mobileSent = true;
                        }

                        if (!mobileSent && !!process.env.TWILIO_PHONE_NUMBER) {
                            await sendSms({
                                customerName: sale.customerName,
                                customerPhone: sale.customerPhone,
                                vendorName: vendorData.name,
                                messageType: 'newSale',
                                invoiceNumber: sale.invoiceNumber,
                                totalAmount: sale.amount,
                            }).catch(() => null);
                        }
                        await new Promise(r => setTimeout(r, 20)); // Respect Twilio limit (80/sec)
                    }

                    // Push
                    const customerUid = customerUidMap.get(sale.customerIdentification);
                    if (customerUid) {
                        await sendPushNotification({
                            userId: customerUid,
                            collectionName: 'customers',
                            title: `Nuevo Crédito: ${vendorData.name}`,
                            body: `Tienes un compromiso por $${sale.amount.toFixed(2)}.`,
                            link: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/customer/commitments`
                        }).catch(() => null);
                    }
                } catch (err) {
                    console.error("Individual notification failed during bulk confirmation", err);
                }
            }
        })();
        
        return {
            success: true,
            message: `${confirmedCount} ventas han sido activadas. Las notificaciones se están enviando ahora mismo.`,
            confirmedCount,
            notificationsSent: confirmedCount,
        };

    } catch (error: any) {
      console.error('Flow Error: confirmPendingSalesFlow failed.', error);
      return { success: false, message: error.message || 'Error del servidor al activar las ventas.', confirmedCount: 0, notificationsSent: 0 };
    }
  }
);
