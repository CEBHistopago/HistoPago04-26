'use server';
/**
 * @fileOverview A flow for retrieving bulk import history for a vendor.
 * - getImportReports: Fetches all documents from the 'import_reports' subcollection.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { BulkImportReportSchema } from '@/lib/data';
import { Timestamp } from 'firebase-admin/firestore';

const GetImportReportsInputSchema = z.object({
  vendorId: z.string().describe('The UID of the vendor.'),
});

const GetImportReportsOutputSchema = z.array(BulkImportReportSchema);

export type GetImportReportsOutput = z.infer<typeof GetImportReportsOutputSchema>;

export async function getImportReports(
  vendorId: string
): Promise<GetImportReportsOutput> {
  return getImportReportsFlow(vendorId);
}

const getImportReportsFlow = ai.defineFlow(
  {
    name: 'getImportReportsFlow',
    inputSchema: z.string(),
    outputSchema: GetImportReportsOutputSchema,
  },
  async (vendorId) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      const reportsSnapshot = await firestore
        .collection('vendors')
        .doc(vendorId)
        .collection('import_reports')
        .orderBy('reportDate', 'desc')
        .get();

      if (reportsSnapshot.empty) {
        return [];
      }

      const reports = reportsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          reportDate: (data.reportDate as Timestamp).toDate().toISOString(),
        } as z.infer<typeof BulkImportReportSchema>;
      });

      return reports;
    } catch (error: any) {
      console.error('Flow Error: getImportReportsFlow failed.', error);
      // Return an empty array on error to avoid crashing the client
      return [];
    }
  }
);
