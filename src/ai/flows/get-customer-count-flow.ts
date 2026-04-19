'use server';
/**
 * @fileOverview A flow for retrieving the total count of registered customers.
 * - getCustomerCount - Fetches the count of documents in the 'customers' collection.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';

const GetCustomerCountOutputSchema = z.object({
    count: z.number(),
});
export type GetCustomerCountOutput = z.infer<typeof GetCustomerCountOutputSchema>;

// Flow implementation
export async function getCustomerCount(): Promise<GetCustomerCountOutput> {
  return getCustomerCountFlow();
}

const getCustomerCountFlow = ai.defineFlow(
  {
    name: 'getCustomerCountFlow',
    outputSchema: GetCustomerCountOutputSchema,
  },
  async () => {
    try {
        const { firestore } = await initializeFirebaseAdmin();
        const customersSnapshot = await firestore.collection('customers').count().get();
        return { count: customersSnapshot.data().count };
    } catch (error) {
        console.error("Error in getCustomerCountFlow:", error);
        // On error, return 0 to prevent crashing the UI
        return { count: 0 };
    }
  }
);
