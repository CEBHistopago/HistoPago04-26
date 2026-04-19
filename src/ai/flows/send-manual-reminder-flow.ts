'use server';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendReminderEmail, SendReminderInputSchema } from './send-reminder-email-flow';
import { format, startOfDay } from 'date-fns';
import { Vendor } from '@/lib/data';

export const SendManualReminderInputSchema = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  vendorEmail: z.string().optional(),
  customerIdentification: z.string(),
  emailPayload: SendReminderInputSchema.pick({
    to: true,
    customerName: true,
    dueAmount: true,
    salesHistory: true,
  }),
});

export type SendManualReminderInput = z.infer<typeof SendManualReminderInputSchema>;

const SendManualReminderOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function sendManualReminder(input: SendManualReminderInput): Promise<z.infer<typeof SendManualReminderOutputSchema>> {
  return sendManualReminderFlow(input);
}

const sendManualReminderFlow = ai.defineFlow(
  {
    name: 'sendManualReminderFlow',
    inputSchema: SendManualReminderInputSchema,
    outputSchema: SendManualReminderOutputSchema,
  },
  async ({ vendorId, vendorName, vendorEmail, customerIdentification, emailPayload }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
      // 0. Seguridad: Verificar suscripción vigente antes de enviar
      const vendorRef = firestore.collection('vendors').doc(vendorId);
      const vendorSnap = await vendorRef.get();
      if (!vendorSnap.exists) throw new Error('Comercio no encontrado.');
      
      const vendor = vendorSnap.data() as Vendor;
      const today = startOfDay(new Date());
      const expiry = vendor.subscriptionEndDate?.toDate 
        ? vendor.subscriptionEndDate.toDate() 
        : (vendor.subscriptionEndDate ? new Date(vendor.subscriptionEndDate) : null);
      
      if (vendor.status !== 'Activo' || (expiry && expiry < today)) {
          // Si está vencido al intentar enviar, actualizamos el estado para que sea coherente
          if (vendor.status === 'Activo') {
              await vendorRef.update({ status: 'Inactivo' });
          }
          throw new Error('Tu suscripción no se encuentra activa. Favor realizar el pago de tu plan para continuar gestionando a tus clientes.');
      }

      // 1. Send the email
      const emailResult = await sendReminderEmail({
        ...emailPayload,
        vendorName,
        vendorEmail,
        emailType: 'overdue',
      });

      if (!emailResult.success) {
        throw new Error(emailResult.message);
      }

      // 2. Update stats atomically using a Firestore transaction
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const dailyStatsRef = firestore.collection('vendors').doc(vendorId).collection('daily_management_stats').doc(todayStr);
      
      await firestore.runTransaction(async (transaction) => {
        const statsDoc = await transaction.get(dailyStatsRef);
        
        if (!statsDoc.exists) {
            transaction.set(dailyStatsRef, {
                contactedClientIds: [customerIdentification],
                notifications: { email: 1, sms: 0, whatsapp: 0, push: 0 },
                updatedAt: Timestamp.now(),
            });
        } else {
            transaction.update(dailyStatsRef, {
                contactedClientIds: FieldValue.arrayUnion(customerIdentification),
                'notifications.email': FieldValue.increment(1),
                updatedAt: Timestamp.now(),
            });
        }
      });

      return { success: true, message: `Recordatorio enviado a ${emailPayload.to}` };

    } catch (error: any) {
      console.error('Error in sendManualReminderFlow:', error);
      return { success: false, message: error.message };
    }
  }
);
