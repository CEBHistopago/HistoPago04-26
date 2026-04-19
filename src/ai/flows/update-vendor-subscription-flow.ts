'use server';
/**
 * @fileOverview A flow for an admin to update a vendor's subscription.
 * - updateVendorSubscription - Updates the status and end date of a vendor's subscription.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';

const UpdateVendorSubscriptionInputSchema = z.object({
  vendorId: z.string().describe("The UID of the vendor to update."),
  status: z.enum(['Activo', 'Inactivo', 'Suspendido']).describe("The new status for the subscription."),
  subscriptionEndDate: z.string().describe("The new subscription end date in ISO format."),
  plan: z.enum(['HistoGestion', 'HistoAlquiler']).describe("The new plan for the vendor."),
});

const UpdateVendorSubscriptionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type UpdateVendorSubscriptionInput = z.infer<typeof UpdateVendorSubscriptionInputSchema>;
export type UpdateVendorSubscriptionOutput = z.infer<typeof UpdateVendorSubscriptionOutputSchema>;

// Flow implementation that the client will call.
export async function updateVendorSubscription(
  input: UpdateVendorSubscriptionInput
): Promise<UpdateVendorSubscriptionOutput> {
  return updateVendorSubscriptionFlow(input);
}

const updateVendorSubscriptionFlow = ai.defineFlow(
  {
    name: 'updateVendorSubscriptionFlow',
    inputSchema: UpdateVendorSubscriptionInputSchema,
    outputSchema: UpdateVendorSubscriptionOutputSchema,
  },
  async ({ vendorId, status, subscriptionEndDate, plan }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      const vendorRef = firestore.collection('vendors').doc(vendorId);

      // Admin SDK has full privileges, so this will bypass client-side security rules.
      await vendorRef.update({
        status: status,
        subscriptionEndDate: Timestamp.fromDate(new Date(subscriptionEndDate)),
        plan: plan,
      });

      return {
        success: true,
        message: 'Suscripción actualizada correctamente por el administrador.',
      };
    } catch (error: any) {
      console.error('Flow Error: updateVendorSubscriptionFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Error del servidor al actualizar la suscripción.',
      };
    }
  }
);
