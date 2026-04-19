'use server';
/**
 * @fileOverview A flow for fetching all payments pending verification for a vendor.
 * - getPendingPaymentsForVendor: Retrieves all payments with 'Pendiente de Verificación' status.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { PaymentSchema, CreditSale } from '@/lib/data';
import { Timestamp } from 'firebase-admin/firestore';

const PendingPaymentDetailsSchema = PaymentSchema.extend({
  customerName: z.string(),
  invoiceNumber: z.string(),
});

const GetPendingPaymentsOutputSchema = z.array(PendingPaymentDetailsSchema);
export type GetPendingPaymentsOutput = z.infer<
  typeof GetPendingPaymentsOutputSchema
>;

export async function getPendingPaymentsForVendor(
  vendorId: string
): Promise<GetPendingPaymentsOutput> {
  return getPendingPaymentsForVendorFlow(vendorId);
}

const getPendingPaymentsForVendorFlow = ai.defineFlow(
  {
    name: 'getPendingPaymentsForVendorFlow',
    inputSchema: z.string(),
    outputSchema: GetPendingPaymentsOutputSchema,
  },
  async (vendorId) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      const vendorSalesRef = firestore.collection('vendors').doc(vendorId).collection('sales');
      const salesSnapshot = await vendorSalesRef.get();

      if (salesSnapshot.empty) {
        return [];
      }

      const pendingPayments: GetPendingPaymentsOutput = [];
      const processingPromises = salesSnapshot.docs.map(async (saleDoc) => {
        const saleData = saleDoc.data() as CreditSale;
        const paymentsRef = saleDoc.ref.collection('payments');
        const pendingPaymentsSnapshot = await paymentsRef.where('status', '==', 'Pendiente de Verificación').get();

        if (!pendingPaymentsSnapshot.empty) {
          pendingPaymentsSnapshot.forEach(paymentDoc => {
            const paymentData = paymentDoc.data();
            pendingPayments.push({
              id: paymentDoc.id,
              creditSaleId: saleDoc.id,
              paymentDate: (paymentData.paymentDate as Timestamp)
                .toDate()
                .toISOString(),
              amount: paymentData.amount,
              paymentMethod: paymentData.paymentMethod || 'Transferencia',
              referenceNumber: paymentData.referenceNumber || '',
              receiptImageUrl: paymentData.receiptImageUrl || '',
              status: paymentData.status,
              reportedBy: paymentData.reportedBy,
              customerName: saleData.customerName,
              invoiceNumber: saleData.invoiceNumber,
            } as z.infer<typeof PendingPaymentDetailsSchema>);
          });
        }
      });

      await Promise.all(processingPromises);

      // Sort by date, most recent first
      pendingPayments.sort(
        (a, b) =>
          new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      );

      return pendingPayments;
    } catch (error: any) {
      console.error(
        'Flow Error: getPendingPaymentsForVendorFlow failed.',
        error
      );
      return []; // Return empty on error
    }
  }
);
