'use server';
/**
 * @fileOverview Flows for generating administrator-level reports.
 * - getSubscriptionRevenue: Calculates total revenue from subscriptions in a date range.
 * - getNewSubscribers: Lists vendors who signed up within a date range.
 * - getSubscribersByStatus: Lists vendors by their current subscription status.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { VendorSchema, SubscriptionPaymentSchema } from '@/lib/data';

// ****** GET SUBSCRIPTION REVENUE FLOW ******

const GetRevenueInputSchema = z.object({
  startDate: z.string().describe("Start date for the report in ISO format."),
  endDate: z.string().describe("End date for the report in ISO format."),
});

const RevenueReportSchema = z.object({
    payments: z.array(SubscriptionPaymentSchema.extend({ vendorName: z.string().optional() })),
    totalAmount: z.number(),
});

export async function getSubscriptionRevenue(
  input: z.infer<typeof GetRevenueInputSchema>
): Promise<z.infer<typeof RevenueReportSchema>> {
  return getSubscriptionRevenueFlow(input);
}

const getSubscriptionRevenueFlow = ai.defineFlow(
  {
    name: 'getSubscriptionRevenueFlow',
    inputSchema: GetRevenueInputSchema,
    outputSchema: RevenueReportSchema,
  },
  async ({ startDate, endDate }) => {
    try {
        const { firestore } = await initializeFirebaseAdmin();
        
        const start = Timestamp.fromDate(new Date(startDate));
        const end = Timestamp.fromDate(new Date(endDate));

        const paymentsSnapshot = await firestore
            .collectionGroup('payments')
            .where('paymentDate', '>=', start)
            .where('paymentDate', '<=', end)
            .get();

        if (paymentsSnapshot.empty) {
            return { payments: [], totalAmount: 0 };
        }

        let totalAmount = 0;
        const paymentPromises = paymentsSnapshot.docs.map(async (doc) => {
            const data = doc.data();
            totalAmount += data.amount;

            const vendorRef = doc.ref.parent.parent;
            let vendorName = 'Comercio Desconocido';
            if (vendorRef) {
                const vendorDoc = await vendorRef.get();
                if (vendorDoc.exists) {
                    vendorName = vendorDoc.data()?.name || vendorName;
                }
            }
            
            return {
                ...data,
                id: doc.id,
                vendorName: vendorName,
                paymentDate: (data.paymentDate as Timestamp).toDate().toISOString(),
                newExpiryDate: (data.newExpiryDate as Timestamp).toDate().toISOString(),
            } as z.infer<typeof SubscriptionPaymentSchema> & { vendorName?: string };
        });

        const payments = await Promise.all(paymentPromises);

        return { payments, totalAmount };

    } catch (error) {
        console.error("Error in getSubscriptionRevenueFlow:", error);
        throw new Error("Failed to generate subscription revenue report.");
    }
  }
);


// ****** GET NEW SUBSCRIBERS FLOW ******

const GetNewSubscribersInputSchema = z.object({
  startDate: z.string().describe("Start date for the report in ISO format."),
  endDate: z.string().describe("End date for the report in ISO format."),
});

const VendorsArraySchema = z.array(VendorSchema);

export async function getNewSubscribers(
  input: z.infer<typeof GetNewSubscribersInputSchema>
): Promise<z.infer<typeof VendorsArraySchema>> {
  return getNewSubscribersFlow(input);
}

const getNewSubscribersFlow = ai.defineFlow(
  {
    name: 'getNewSubscribersFlow',
    inputSchema: GetNewSubscribersInputSchema,
    outputSchema: VendorsArraySchema,
  },
  async ({ startDate, endDate }) => {
    try {
        const { firestore } = await initializeFirebaseAdmin();
        
        const start = Timestamp.fromDate(new Date(startDate));
        const end = Timestamp.fromDate(new Date(endDate));

        const vendorsSnapshot = await firestore
            .collection('vendors')
            .where('creationDate', '>=', start)
            .where('creationDate', '<=', end)
            .orderBy('creationDate', 'desc')
            .get();
            
        if (vendorsSnapshot.empty) {
            return [];
        }

        const vendors = vendorsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                subscriptionEndDate: (data.subscriptionEndDate as Timestamp)?.toDate().toISOString(),
                creationDate: (data.creationDate as Timestamp)?.toDate().toISOString(),
            } as z.infer<typeof VendorSchema>;
        });

        return vendors;

    } catch (error) {
        console.error("Error in getNewSubscribersFlow:", error);
        throw new Error("Failed to generate new subscribers report.");
    }
  }
);


// ****** GET SUBSCRIBERS BY STATUS FLOW ******

const GetByStatusInputSchema = z.object({
    status: z.enum(['Activo', 'Inactivo', 'Suspendido']),
});

export async function getSubscribersByStatus(
  input: z.infer<typeof GetByStatusInputSchema>
): Promise<z.infer<typeof VendorsArraySchema>> {
  return getSubscribersByStatusFlow(input);
}

const getSubscribersByStatusFlow = ai.defineFlow(
  {
    name: 'getSubscribersByStatusFlow',
    inputSchema: GetByStatusInputSchema,
    outputSchema: VendorsArraySchema,
  },
  async ({ status }) => {
    try {
        const { firestore } = await initializeFirebaseAdmin();

        const vendorsSnapshot = await firestore
            .collection('vendors')
            .where('status', '==', status)
            .get();

        if (vendorsSnapshot.empty) {
            return [];
        }

        const vendors = vendorsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                subscriptionEndDate: (data.subscriptionEndDate as Timestamp)?.toDate().toISOString(),
                creationDate: (data.creationDate as Timestamp)?.toDate().toISOString(),
            } as z.infer<typeof VendorSchema>;
        });

        return vendors;
    } catch (error) {
        console.error("Error in getSubscribersByStatusFlow:", error);
        throw new Error("Failed to generate subscribers by status report.");
    }
  }
);
