'use server';
/**
 * @fileOverview A flow for saving a user's Firebase Cloud Messaging (FCM) token.
 * This flow now includes a reverse-index lookup to handle shared devices correctly and efficiently,
 * and determines the user's collection on the server side for robustness.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

const SaveTokenInputSchema = z.object({
  userId: z.string().describe("The UID of the user."),
  token: z.string().describe("The FCM device token."),
});
export type SaveTokenInput = z.infer<typeof SaveTokenInputSchema>;

const SaveTokenOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type SaveTokenOutput = z.infer<typeof SaveTokenOutputSchema>;

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
    throw new Error(`Perfil de usuario ${userId} no encontrado.`);
}

export async function saveFcmToken(input: SaveTokenInput): Promise<SaveTokenOutput> {
  return saveFcmTokenFlow(input);
}

const saveFcmTokenFlow = ai.defineFlow(
  {
    name: 'saveFcmTokenFlow',
    inputSchema: SaveTokenInputSchema,
    outputSchema: SaveTokenOutputSchema,
  },
  async ({ userId, token }) => {
    try {
      const { firestore } = await initializeFirebaseAdmin();
      
      const collectionName = await findUserCollection(firestore, userId);
        
      const userDocRef = firestore.collection(collectionName).doc(userId);
      const tokenRegistryRef = firestore.collection('fcm_token_registry').doc(token);

      const tokenDoc = await tokenRegistryRef.get();
      if (tokenDoc.exists) {
        const previousOwner = tokenDoc.data();
        if (previousOwner && previousOwner.userId && previousOwner.userId !== userId && previousOwner.userCollection) {
          const prevUserDocRef = firestore.collection(previousOwner.userCollection).doc(previousOwner.userId);
          await prevUserDocRef.update({
            fcmTokens: FieldValue.arrayRemove(token)
          }).catch(() => null);
        }
      }

      await userDocRef.update({
        fcmTokens: FieldValue.arrayUnion(token),
      });

      await tokenRegistryRef.set({
        userId: userId,
        userCollection: collectionName,
        lastUsed: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        message: 'Dispositivo vinculado correctamente.',
      };
    } catch (error: any) {
      console.error('Flow Error: saveFcmTokenFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Error al vincular el dispositivo para notificaciones.',
      };
    }
  }
);
