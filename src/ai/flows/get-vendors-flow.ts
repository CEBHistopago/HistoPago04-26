'use server';
/**
 * @fileOverview A flow for retrieving all vendors from Firestore.
 * - getVendors - Fetches a list of all users with the 'vendor' role.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { Vendor, VendorSchema } from '@/lib/data';
import { Timestamp } from 'firebase-admin/firestore';


const GetVendorsOutputSchema = z.array(VendorSchema);
export type GetVendorsOutput = z.infer<typeof GetVendorsOutputSchema>;

// Flow implementation
export async function getVendors(): Promise<GetVendorsOutput> {
  return getVendorsFlow();
}

const getVendorsFlow = ai.defineFlow(
  {
    name: 'getVendorsFlow',
    outputSchema: GetVendorsOutputSchema,
  },
  async () => {
    const { firestore } = await initializeFirebaseAdmin();

    const vendorsSnapshot = await firestore
      .collection('vendors')
      .get();

    if (vendorsSnapshot.empty) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set time to the beginning of the day for comparison
    const updatePromises: Promise<any>[] = [];

    const vendors = vendorsSnapshot.docs
      .map(doc => {
        const data = doc.data();
        let vendorData: Record<string, any> = { ...data, id: doc.id };
        
        // Robust plan normalization
        if (vendorData.plan === 'Comercio') {
            vendorData.plan = 'HistoGestion';
        }

        // Serialize Timestamps to ISO strings for safe parsing
        if (vendorData.subscriptionEndDate && vendorData.subscriptionEndDate instanceof Timestamp) {
            vendorData.subscriptionEndDate = vendorData.subscriptionEndDate.toDate().toISOString();
        }
        if (vendorData.creationDate && vendorData.creationDate instanceof Timestamp) {
            vendorData.creationDate = vendorData.creationDate.toDate().toISOString();
        }

        // Validate each document safely
        const parsed = VendorSchema.safeParse(vendorData);

        if (parsed.success) {
            const finalData = parsed.data;
            // Check if subscription is expired and update status if needed
            if (finalData.subscriptionEndDate && new Date(finalData.subscriptionEndDate) < today && finalData.status === 'Activo') {
                finalData.status = 'Inactivo'; // Update local object
                const vendorRef = firestore.collection('vendors').doc(doc.id);
                // Add the update operation to a list of promises
                updatePromises.push(vendorRef.update({ status: 'Inactivo' }));
            }
            return finalData;
        } else {
            console.warn(`[getVendorsFlow] Skipping document '${doc.id}' due to validation error:`, parsed.error.flatten().fieldErrors);
            return null; // This document will be filtered out
        }
    });

    // Filter out null values from failed validations
    const validVendors = vendors.filter((v): v is Vendor => v !== null);
    
    // Wait for all background updates to complete before returning
    try {
        await Promise.all(updatePromises);
    } catch (updateError) {
        console.error('[getVendorsFlow] Error during background status updates:', updateError);
        // We don't re-throw, as the primary goal is to return the valid data.
    }
    
    // Return all valid documents from the 'vendors' collection.
    // The previous filter for role === 'vendor' was too restrictive for stat calculation.
    return validVendors;
  }
);
