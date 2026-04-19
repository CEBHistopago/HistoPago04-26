'use server';
/**
 * @fileOverview Flow to retrieve billing invoices for a vendor.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { InvoiceSchema } from '@/lib/data';
import { Timestamp } from 'firebase-admin/firestore';

const GetInvoicesInputSchema = z.string();
const GetInvoicesOutputSchema = z.array(InvoiceSchema);

export async function getInvoicesForVendor(vendorId: string): Promise<z.infer<typeof GetInvoicesOutputSchema>> {
  return getInvoicesForVendorFlow(vendorId);
}

const getInvoicesForVendorFlow = ai.defineFlow(
  {
    name: 'getInvoicesForVendorFlow',
    inputSchema: GetInvoicesInputSchema,
    outputSchema: GetInvoicesOutputSchema,
  },
  async (vendorId) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      const invoicesSnapshot = await firestore
        .collection('vendors').doc(vendorId).collection('invoices')
        .orderBy('invoiceDate', 'desc')
        .get();

      if (invoicesSnapshot.empty) {
        return [];
      }

      return invoicesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          invoiceDate: (data.invoiceDate as Timestamp).toDate().toISOString(),
          periodStart: (data.periodStart as Timestamp).toDate().toISOString(),
          periodEnd: (data.periodEnd as Timestamp).toDate().toISOString(),
        } as z.infer<typeof InvoiceSchema>;
      });
    } catch (error) {
      console.error(`Error fetching invoices for vendor ${vendorId}:`, error);
      return [];
    }
  }
);
