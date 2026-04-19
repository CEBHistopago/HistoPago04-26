'use server';
/**
 * @fileOverview A flow for saving a user's Firebase Cloud Messaging (FCM) token.
 * This flow now includes a reverse-index lookup to handle shared devices correctly and efficiently.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

const SaveTokenInputSchema = z.object({
  userId: z.string().describe("The UID of the user."),
  token: z.string().describe("The FCM device token."),
  role: z.enum(['vendor', 'customer', 'admin']).describe("The role of the user."),
});
export type SaveTokenInput = z.infer<typeof SaveTokenInputSchema>;

const SaveTokenOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type SaveTokenOutput = z.infer<typeof SaveTokenOutputSchema>;

export async function saveFcmToken(input: SaveTokenInput): Promise<SaveTokenOutput> {
  return saveFcmTokenFlow(input);
}

const saveFcmTokenFlow = ai.defineFlow(
  {
    name: 'saveFcmTokenFlow',
    inputSchema: SaveTokenInputSchema,
    outputSchema: SaveTokenOutputSchema,
  },
  async ({ userId, token, role }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      const collectionName = role === 'admin' 
        ? 'admins'
        : role === 'vendor' 
        ? 'vendors' 
        : 'customers';
        
      const userDocRef = firestore.collection(collectionName).doc(userId);
      const tokenRegistryRef = firestore.collection('fcm_token_registry').doc(token);

      // --- Scalable Shared Device Handling ---
      // 1. Check if this token is already registered to another user.
      const tokenDoc = await tokenRegistryRef.get();
      if (tokenDoc.exists) {
        const previousOwner = tokenDoc.data();
        // 2. If it belongs to a *different* user, remove the token from their profile.
        if (previousOwner && previousOwner.userId && previousOwner.userId !== userId) {
          console.log(`Token transfer detected. Removing from previous owner: ${previousOwner.userId}`);
          const prevUserDocRef = firestore.collection(previousOwner.userCollection).doc(previousOwner.userId);
          await prevUserDocRef.update({
            fcmTokens: FieldValue.arrayRemove(token)
          });
        }
      }

      // 3. Set the token on the current user's profile. Overwriting ensures they only have this one active token.
      await userDocRef.set({
        fcmTokens: [token],
      }, { merge: true });

      // 4. Update the token registry to point to the new (or current) owner.
      await tokenRegistryRef.set({
        userId: userId,
        userCollection: collectionName,
        lastUsed: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: 'Token guardado y dispositivo principal actualizado.',
      };
    } catch (error: any) {
      console.error('Flow Error: saveFcmTokenFlow failed.', error);
      return {
        success: false,
        message: error.message || 'No se pudo guardar el token de notificación.',
      };
    }
  }
);
