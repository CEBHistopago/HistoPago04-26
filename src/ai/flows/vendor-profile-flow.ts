'use server';
/**
 * @fileOverview A flow for a vendor to update their own profile information.
 * - updateVendorProfileClient - Updates the profile data for the authenticated vendor.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { VendorProfileSchema } from '@/lib/data';
import { z } from 'zod';
import { getAuth } from 'firebase-admin/auth';


const UpdateVendorProfileClientInputSchema = z.object({
  vendorId: z.string().describe("The UID of the vendor to update."),
  profileData: VendorProfileSchema,
});

const UpdateVendorProfileClientOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type UpdateVendorProfileClientInput = z.infer<typeof UpdateVendorProfileClientInputSchema>;
export type UpdateVendorProfileClientOutput = z.infer<typeof UpdateVendorProfileClientOutputSchema>;

// This exported function is what the client calls.
export async function updateVendorProfileClient(
  input: UpdateVendorProfileClientInput
): Promise<UpdateVendorProfileClientOutput> {
  return updateVendorProfileClientFlow(input);
}

const updateVendorProfileClientFlow = ai.defineFlow(
  {
    name: 'updateVendorProfileClientFlow',
    inputSchema: UpdateVendorProfileClientInputSchema,
    outputSchema: UpdateVendorProfileClientOutputSchema,
  },
  async ({ vendorId, profileData }, context) => {
    
    // Auth check is now handled by the authPolicy

    try {
      const { firestore, adminApp } = await initializeFirebaseAdmin();
      const auth = getAuth(adminApp);
      
      const vendorRef = firestore.collection('vendors').doc(vendorId);

      // Perform a partial update using the validated schema data.
      await vendorRef.update({
        name: profileData.name,
        email: profileData.email,
        identificationNumber: profileData.identificationNumber || '',
        address: profileData.address || '',
        phone: profileData.phone || '',
        legalRepName: profileData.legalRepName || '',
        legalRepIdentificationNumber: profileData.legalRepIdentificationNumber || '',
        legalRepAddress: profileData.legalRepAddress || '',
        legalRepPhone: profileData.legalRepPhone || '',
        legalRepEmail: profileData.legalRepEmail || '',
        enableDailyReport: profileData.enableDailyReport || false,
        reminderDaysBefore: profileData.reminderDaysBefore || 2, // Default to 2 if not provided
      });

      // Update the user's auth record as well to keep them synchronized
      await auth.updateUser(vendorId, {
        displayName: profileData.name,
        email: profileData.email,
      });

      return {
        success: true,
        message: 'Tu perfil ha sido actualizado correctamente.',
      };
    } catch (error: any) {
      console.error('Flow Error: updateVendorProfileClientFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Error del servidor al actualizar el perfil.',
      };
    }
  }
);
