'use server';
/**
 * @fileOverview A flow for a vendor to report a subscription payment they have made.
 * - reportSubscriptionPayment: Creates a payment report for an admin to verify.
 * - getPendingSubscriptionPayments: Retrieves all pending payment reports for all vendors.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { SubscriptionPaymentReport } from '@/lib/data';

// ****** REPORT PAYMENT FLOW ******

const ReportPaymentInputSchema = z.object({
  vendorId: z.string(),
  paymentDate: z.string(),
  amount: z.number(),
  monthsPaid: z.number(),
  paymentMethod: z.enum(['Transferencia', 'Pago Movil', 'Zelle', 'Efectivo']),
  referenceNumber: z.string().optional(),
});

const ReportPaymentOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function reportSubscriptionPayment(
  input: z.infer<typeof ReportPaymentInputSchema>
): Promise<z.infer<typeof ReportPaymentOutputSchema>> {
  return reportSubscriptionPaymentFlow(input);
}

const reportSubscriptionPaymentFlow = ai.defineFlow(
  {
    name: 'reportSubscriptionPaymentFlow',
    inputSchema: ReportPaymentInputSchema,
    outputSchema: ReportPaymentOutputSchema,
  },
  async ({ vendorId, ...data }) => {
    const { firestore } = await initializeFirebaseAdmin();

    try {
      const vendorRef = firestore.collection('vendors').doc(vendorId);
      const reportsRef = vendorRef.collection('subscription_payments_reports');

      await reportsRef.add({
        ...data,
        vendorId: vendorId,
        reportDate: Timestamp.now(),
        paymentDate: Timestamp.fromDate(new Date(data.paymentDate)),
        status: 'Pendiente de Verificación',
      });

      return {
        success: true,
        message: 'Pago reportado exitosamente. Será verificado por un administrador.',
      };
    } catch (error: any) {
      console.error('Flow Error: reportSubscriptionPaymentFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Error del servidor al reportar el pago.',
      };
    }
  }
);


// ****** GET PENDING PAYMENTS (FOR ADMIN) FLOW ******

const GetPendingPaymentsOutputSchema = z.array(SubscriptionPaymentReport);
export type GetPendingPaymentsOutput = z.infer<typeof GetPendingPaymentsOutputSchema>;

export async function getPendingSubscriptionPayments(): Promise<GetPendingPaymentsOutput> {
  return getPendingSubscriptionPaymentsFlow();
}

const getPendingSubscriptionPaymentsFlow = ai.defineFlow(
  {
    name: 'getPendingSubscriptionPaymentsFlow',
    outputSchema: GetPendingPaymentsOutputSchema,
  },
  async () => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      const reportsSnapshot = await firestore
        .collectionGroup('subscription_payments_reports')
        .where('status', '==', 'Pendiente de Verificación')
        .orderBy('reportDate', 'desc')
        .get();

      if (reportsSnapshot.empty) {
        return [];
      }

      const pendingReports = await Promise.all(reportsSnapshot.docs.map(async (doc) => {
        const data = doc.data();
        const vendorDoc = await firestore.collection('vendors').doc(data.vendorId).get();
        const vendorName = vendorDoc.exists() ? vendorDoc.data()?.name : 'Comercio Desconocido';
        
        return {
          ...data,
          id: doc.id,
          vendorName,
          reportDate: (data.reportDate as Timestamp).toDate().toISOString(),
          paymentDate: (data.paymentDate as Timestamp).toDate().toISOString(),
        } as SubscriptionPaymentReport;
      }));

      return pendingReports;

    } catch (error: any) {
      console.error('Flow Error: getPendingSubscriptionPaymentsFlow failed.', error);
      return [];
    }
  }
);
