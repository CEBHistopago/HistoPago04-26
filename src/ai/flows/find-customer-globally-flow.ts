'use server';
/**
 * @fileOverview A server-side flow for finding customer data for autocompletion.
 * This flow performs a global, cross-vendor search for a customer's most recent data.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';

const FindCustomerGloballyInputSchema = z.object({
  customerIdentification: z.string().describe("The identification number of the customer to find."),
});

// The output can be a customer data object or null if not found
const CustomerDataSchema = z.object({
    customerName: z.string(),
    customerEmail: z.string().optional(),
    customerPhone: z.string().optional(),
    customerType: z.string().optional(),
});
const FindCustomerGloballyOutputSchema = CustomerDataSchema.nullable();

export type FindCustomerGloballyInput = z.infer<typeof FindCustomerGloballyInputSchema>;
export type FindCustomerGloballyOutput = z.infer<typeof FindCustomerGloballyOutputSchema>;

export async function findCustomerGlobally(
  input: FindCustomerGloballyInput
): Promise<FindCustomerGloballyOutput> {
  return findCustomerGloballyFlow(input);
}

const findCustomerGloballyFlow = ai.defineFlow(
  {
    name: 'findCustomerGloballyFlow',
    inputSchema: FindCustomerGloballyInputSchema,
    outputSchema: FindCustomerGloballyOutputSchema,
  },
  async ({ customerIdentification }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      // Step 1: Search the global 'customers' collection first.
      // This is the most authoritative source for registered customers.
      const customersRef = firestore.collection('customers');
      const customerQuery = customersRef.where('identificationNumber', '==', customerIdentification).limit(1);
      const customerSnapshot = await customerQuery.get();

      if (!customerSnapshot.empty) {
        const customerData = customerSnapshot.docs[0].data();
        return {
            customerName: customerData.name || '',
            customerEmail: customerData.email || '',
            customerPhone: customerData.phone || '',
            customerType: customerData.customerType || 'Persona Natural', // Use stored type or default
        };
      }
      
      // Step 2: If not found, search across all sales for the most recent entry for this customer.
      // This is a fallback for customers who exist in sales but not in the global customer list.
      const salesRef = firestore.collectionGroup('sales');
      const q = salesRef
        .where('customerIdentification', '==', customerIdentification)
        .orderBy('saleDate', 'desc')
        .limit(1);
      
      const salesSnapshot = await q.get();

      if (!salesSnapshot.empty) {
        const latestSaleData = salesSnapshot.docs[0].data();
        // Return data from the most recent sale found across all vendors
        return {
            customerName: latestSaleData.customerName,
            customerEmail: latestSaleData.customerEmail,
            customerPhone: latestSaleData.customerPhone,
            customerType: latestSaleData.customerType,
        };
      }
      
      // Step 3: If not found anywhere, return null.
      return null;

    } catch (error: any) {
      console.error('Flow Error: findCustomerGloballyFlow failed.', error);
      // In case of a server error, we return null to the client.
      return null;
    }
  }
);
