'use server';
/**
 * @fileOverview A flow for removing a user's Firebase Cloud Messaging (FCM) token upon logout.
 * This flow now determines the user's collection on the server side for robustness.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

const RemoveTokenInputSchema = z.object({
  userId: z.string().describe("The UID of the user."),
  token: z.string().describe("The FCM device token to remove."),
});
export type RemoveTokenInput = z.infer<typeof RemoveTokenInputSchema>;

const RemoveTokenOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type RemoveTokenOutput = z.infer<typeof RemoveTokenOutputSchema>;

/**
 * Finds the collection name for a given user ID by checking potential collections.
 * @param firestore - The Firestore admin instance.
 * @param userId - The UID of the user to find.
 * @returns The name of the collection where the user was found.
 * @throws If the user is not found in any of the collections.
 */
async function findUserCollection(firestore: Firestore, userId: string): Promise<'admins' | 'vendors' | 'customers'> {
    const collectionsToSearch: ('admins' | 'vendors' | 'customers')[] = ['admins', 'vendors', 'customers'];
    for (const collectionName of collectionsToSearch) {
        const docRef = firestore.collection(collectionName).doc(userId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            return collectionName;
        }
    }
    throw new Error(`User profile with ID ${userId} not found in any collection.`);
}

export async function removeFcmToken(input: RemoveTokenInput): Promise<RemoveTokenOutput> {
  return removeFcmTokenFlow(input);
}

const removeFcmTokenFlow = ai.defineFlow(
  {
    name: 'removeFcmTokenFlow',
    inputSchema: RemoveTokenInputSchema,
    outputSchema: RemoveTokenOutputSchema,
  },
  async ({ userId, token }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      const collectionName = await findUserCollection(firestore, userId);
        
      const userDocRef = firestore.collection(collectionName).doc(userId);

      // Use FieldValue.arrayRemove to remove the specific token from the array.
      // This is safe and will not throw an error if the token is not found.
      await userDocRef.update({
        fcmTokens: FieldValue.arrayRemove(token),
      });

      // Also remove the token from the central registry
      const tokenRegistryRef = firestore.collection('fcm_token_registry').doc(token);
      await tokenRegistryRef.delete();


      return {
        success: true,
        message: 'Token desvinculado exitosamente.',
      };
    } catch (error: any) {
      // We log the error on the server but don't want to block the client's logout process.
      // A failure here is not critical for the user experience of logging out.
      console.error('Flow Error: removeFcmTokenFlow failed.', error);
      return {
        success: false,
        message: error.message || 'No se pudo desvincular el token de notificación.',
      };
    }
  }
);
