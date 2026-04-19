'use server';
/**
 * @fileOverview Flows for managing vendor subscription payments.
 * - createSubscriptionPayment: Creates a payment record and updates the vendor's subscription.
 * - getPaymentsForVendor: Retrieves all payment records for a specific vendor.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { CreateSubscriptionPaymentSchema, SubscriptionPaymentSchema } from '@/lib/data';
import { addMonths } from 'date-fns';

// ****** CREATE PAYMENT FLOW ******

const CreateSubscriptionPaymentInputSchema = CreateSubscriptionPaymentSchema.extend({
    vendorId: z.string().describe("The UID of the vendor making the payment."),
    reportId: z.string().optional().describe("The ID of the payment report document if this is a verification."),
});

const CreateSubscriptionPaymentOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type CreateSubscriptionPaymentInput = z.infer<typeof CreateSubscriptionPaymentInputSchema>;
export type CreateSubscriptionPaymentOutput = z.infer<typeof CreateSubscriptionPaymentOutputSchema>;

export async function createSubscriptionPayment(
  input: CreateSubscriptionPaymentInput
): Promise<CreateSubscriptionPaymentOutput> {
  return createSubscriptionPaymentFlow(input);
}

const createSubscriptionPaymentFlow = ai.defineFlow(
  {
    name: 'createSubscriptionPaymentFlow',
    inputSchema: CreateSubscriptionPaymentInputSchema,
    outputSchema: CreateSubscriptionPaymentOutputSchema,
  },
  async ({ vendorId, reportId, ...paymentData }) => {
    const { firestore } = await initializeFirebaseAdmin();

    try {
      await firestore.runTransaction(async (transaction) => {
        const vendorRef = firestore.collection('vendors').doc(vendorId);
        const vendorDoc = await transaction.get(vendorRef);

        if (!vendorDoc.exists) {
          throw new Error('El comercio no fue encontrado.');
        }

        const vendor = vendorDoc.data();
        if (!vendor) {
            throw new Error('No se pudo leer la data del comercio');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let currentExpiry: Date;
        if (vendor.subscriptionEndDate && vendor.subscriptionEndDate.toDate() > today) {
            currentExpiry = vendor.subscriptionEndDate.toDate();
        } else {
            currentExpiry = today;
        }
        
        const newExpiryDate = addMonths(currentExpiry, paymentData.monthsPaid);

        const paymentRef = vendorRef.collection('payments').doc();
        transaction.set(paymentRef, {
            ...paymentData,
            vendorId: vendorId,
            paymentDate: Timestamp.fromDate(new Date(paymentData.paymentDate)),
            newExpiryDate: Timestamp.fromDate(newExpiryDate),
        });

        transaction.update(vendorRef, {
          status: 'Activo',
          subscriptionEndDate: Timestamp.fromDate(newExpiryDate),
        });
        
        // If this is a verification of a report, update the report status
        if (reportId) {
            const reportRef = firestore.doc(`vendors/${vendorId}/subscription_payments_reports/${reportId}`);
            transaction.update(reportRef, { status: 'Verificado' });
        }
      });

      return {
        success: true,
        message: 'Pago registrado y suscripción actualizada correctamente.',
      };
    } catch (error: any) {
      console.error('Flow Error: createSubscriptionPaymentFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Error del servidor al registrar el pago.',
      };
    }
  }
);


// ****** GET PAYMENTS FLOW ******

const GetPaymentsInputSchema = z.object({
  vendorId: z.string().describe("The UID of the vendor."),
});

const GetPaymentsOutputSchema = z.array(SubscriptionPaymentSchema);

export type GetPaymentsOutput = z.infer<typeof GetPaymentsOutputSchema>;

export async function getPaymentsForVendor(
  vendorId: string
): Promise<GetPaymentsOutput> {
  return getPaymentsForVendorFlow(vendorId);
}

const getPaymentsForVendorFlow = ai.defineFlow(
  {
    name: 'getPaymentsForVendorFlow',
    inputSchema: z.string(),
    outputSchema: GetPaymentsOutputSchema,
  },
  async (vendorId) => {
    try {
        const { firestore } = await initializeFirebaseAdmin();
        const paymentsSnapshot = await firestore
            .collection('vendors')
            .doc(vendorId)
            .collection('payments')
            .orderBy('paymentDate', 'desc')
            .get();

        if (paymentsSnapshot.empty) {
            return [];
        }

        const payments = paymentsSnapshot.docs.map(doc => {
            const data = doc.data();
            // Serialize Timestamps to ISO strings for client compatibility
            return {
                ...data,
                id: doc.id,
                paymentDate: (data.paymentDate as Timestamp).toDate().toISOString(),
                newExpiryDate: (data.newExpiryDate as Timestamp).toDate().toISOString(),
            } as z.infer<typeof SubscriptionPaymentSchema>;
        });

        return payments;

    } catch (error: any) {
      console.error('Flow Error: getPaymentsForVendorFlow failed.', error);
      // Return an empty array on error to avoid crashing the client
      return [];
    }
  }
);
