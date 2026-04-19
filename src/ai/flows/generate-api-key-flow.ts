'use server';
/**
 * @fileOverview A flow for generating a new API key for a vendor.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import crypto from 'crypto';

const GenerateApiKeyInputSchema = z.object({
  vendorId: z.string().describe("The UID of the vendor to generate the key for."),
});

const GenerateApiKeyOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  apiKey: z.string().optional(),
});

export type GenerateApiKeyInput = z.infer<typeof GenerateApiKeyInputSchema>;
export type GenerateApiKeyOutput = z.infer<typeof GenerateApiKeyOutputSchema>;

// This is the exported function that the client will call.
export async function generateApiKeyForVendor(
  input: GenerateApiKeyInput
): Promise<GenerateApiKeyOutput> {
  return generateApiKeyFlow(input);
}

const generateApiKeyFlow = ai.defineFlow(
  {
    name: 'generateApiKeyFlow',
    inputSchema: GenerateApiKeyInputSchema,
    outputSchema: GenerateApiKeyOutputSchema,
  },
  async ({ vendorId }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      const vendorRef = firestore.collection('vendors').doc(vendorId);
      
      const vendorDoc = await vendorRef.get();
      if (!vendorDoc.exists) {
        throw new Error("Vendor not found.");
      }

      // Generate a secure, random API key
      const newApiKey = `sk_${crypto.randomBytes(24).toString('hex')}`;

      // Save the new key to the vendor's document
      await vendorRef.update({
        apiKey: newApiKey,
      });

      return {
        success: true,
        message: 'Nueva API Key generada exitosamente.',
        apiKey: newApiKey,
      };

    } catch (error: any) {
      console.error('Flow Error: generateApiKeyFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Error del servidor al generar la API key.',
      };
    }
  }
);
