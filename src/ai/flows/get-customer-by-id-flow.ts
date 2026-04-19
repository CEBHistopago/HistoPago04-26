'use server';
/**
 * @fileOverview A server-side flow for securely fetching a customer's profile by their ID.
 * - getCustomerById: Fetches a single customer profile based on their identification number.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CustomerSchema } from '@/lib/data';

const GetCustomerByIdInputSchema = z.object({
  identificationNumber: z.string().describe("The identification number (cédula or RIF) of the customer to find."),
});

// The output can be a customer or null if not found
const GetCustomerByIdOutputSchema = CustomerSchema.nullable();

export type GetCustomerByIdInput = z.infer<typeof GetCustomerByIdInputSchema>;
export type GetCustomerByIdOutput = z.infer<typeof GetCustomerByIdOutputSchema>;

export async function getCustomerById(
  input: GetCustomerByIdInput
): Promise<GetCustomerByIdOutput> {
  return getCustomerByIdFlow(input);
}

const getCustomerByIdFlow = ai.defineFlow(
  {
    name: 'getCustomerByIdFlow',
    inputSchema: GetCustomerByIdInputSchema,
    outputSchema: GetCustomerByIdOutputSchema,
  },
  async ({ identificationNumber }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      const customersRef = firestore.collection('customers');
      const q = customersRef.where('identificationNumber', '==', identificationNumber).limit(1);
      
      const querySnapshot = await q.get();

      if (querySnapshot.empty) {
        return null; // Return null if no customer is found
      }

      const customerDoc = querySnapshot.docs[0];
      const customerData = customerDoc.data();

      // Validate data against schema before returning
      const parsedData = CustomerSchema.safeParse({ id: customerDoc.id, ...customerData });

      if (parsedData.success) {
        return parsedData.data;
      } else {
        // This case is for data integrity issues.
        console.error("Firestore data for customer does not match CustomerSchema", parsedData.error);
        return null;
      }

    } catch (error: any) {
      console.error('Flow Error: getCustomerByIdFlow failed.', error);
      // In case of a server error, we also return null to the client
      // to avoid exposing internal errors.
      return null;
    }
  }
);
