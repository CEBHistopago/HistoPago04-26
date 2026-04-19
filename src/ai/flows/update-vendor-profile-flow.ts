'use server';
/**
 * @fileOverview A flow for an admin to update a vendor's profile information.
 * - updateVendorProfile - Updates the profile data for a specific vendor.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { VendorProfileSchema } from '@/lib/data';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';


const UpdateVendorProfileInputSchema = z.object({
  vendorId: z.string().describe("The UID of the vendor to update."),
  profileData: VendorProfileSchema,
});

const UpdateVendorProfileOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type UpdateVendorProfileInput = z.infer<typeof UpdateVendorProfileInputSchema>;
export type UpdateVendorProfileOutput = z.infer<typeof UpdateVendorProfileOutputSchema>;

// Flow implementation that the client will call.
export async function updateVendorProfile(
  input: UpdateVendorProfileInput
): Promise<UpdateVendorProfileOutput> {
  return updateVendorProfileFlow(input);
}

const updateVendorProfileFlow = ai.defineFlow(
  {
    name: 'updateVendorProfileFlow',
    inputSchema: UpdateVendorProfileInputSchema,
    outputSchema: UpdateVendorProfileOutputSchema,
  },
  async ({ vendorId, profileData }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      const vendorRef = firestore.collection('vendors').doc(vendorId);

      // Create a mutable copy of the profile data
      const dataToUpdate: Record<string, any> = { ...profileData };

      // If creationDate is provided and is a string, convert it to a Timestamp
      if (profileData.creationDate && typeof profileData.creationDate === 'string') {
        const date = new Date(profileData.creationDate);
        // Adjust for timezone offset to store the correct date
        const userTimezoneOffset = date.getTimezoneOffset() * 60000;
        const correctedDate = new Date(date.getTime() + userTimezoneOffset);
        dataToUpdate.creationDate = Timestamp.fromDate(correctedDate);
      }
      
      // Admin SDK has full privileges, so this will bypass client-side security rules.
      // We use set with merge:true to avoid overwriting fields not in VendorProfileSchema
      await vendorRef.set(dataToUpdate, { merge: true });

      return {
        success: true,
        message: 'Perfil del comercio actualizado correctamente por el administrador.',
      };
    } catch (error: any) {
      console.error('Flow Error: updateVendorProfileFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Error del servidor al actualizar el perfil.',
      };
    }
  }
);
