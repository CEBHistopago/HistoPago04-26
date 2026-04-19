'use server';
/**
 * @fileOverview A flow for sending a web push notification to a user via FCM.
 * Fixed the wrapper function to use typed SendPushNotificationOutput.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { getMessaging } from 'firebase-admin/messaging';
import { z } from 'zod';
import {
  SendPushNotificationInputSchema,
  SendPushNotificationOutputSchema,
  type SendPushNotificationInput,
  type SendPushNotificationOutput,
} from '@/lib/data';

export async function sendPushNotification(input: SendPushNotificationInput): Promise<SendPushNotificationOutput> {
  return sendPushNotificationFlow(input);
}

const sendPushNotificationFlow = ai.defineFlow(
  {
    name: 'sendPushNotificationFlow',
    inputSchema: SendPushNotificationInputSchema,
    outputSchema: SendPushNotificationOutputSchema,
  },
  async ({ userId, collectionName, title, body, link }) => {
    try {
      const { firestore, adminApp } = await initializeFirebaseAdmin();

      // 1. Fetch user document to get FCM tokens.
      const userDocRef = firestore.collection(collectionName).doc(userId);
      const userDoc = await userDocRef.get();

      if (!userDoc.exists) {
        throw new Error(`User with ID ${userId} not found in collection '${collectionName}'.`);
      }

      const userData = userDoc.data();
      const tokens = userData?.fcmTokens;

      if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
        return { 
          success: true, 
          message: `User ${userId} has no registered notification tokens.`,
          successCount: 0,
          failureCount: 0
        };
      }

      // 2. Construct the notification payload.
      const message = {
        notification: {
          title: title,
          body: body,
        },
        webpush: {
          notification: {
            icon: '/logo-192.png', // URL to an icon
          },
          fcmOptions: {
            link: link, // URL to open on click
          },
        },
        tokens: tokens,
      };

      // 3. Send the message.
      const messaging = getMessaging(adminApp);
      const response = await messaging.sendEachForMulticast(message);

      console.log(`[PUSH_FLOW] Sent notifications to user ${userId}. Success: ${response.successCount}, Failure: ${response.failureCount}`);
      
      // 4. Clean up invalid tokens from Firestore.
      const invalidTokens: string[] = [];
      response.responses.forEach((result, index) => {
        if (!result.success) {
          const error = result.error;
          if (error && (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered')) {
            invalidTokens.push(tokens[index]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        const { FieldValue } = await import('firebase-admin/firestore');
        await userDocRef.update({
          fcmTokens: FieldValue.arrayRemove(...invalidTokens),
        });
        console.log(`[PUSH_FLOW] Cleaned up ${invalidTokens.length} invalid tokens for user ${userId}.`);
      }

      return {
        success: true,
        message: response.failureCount > 0 
          ? `Notificaciones enviadas parcialmente. Éxitos: ${response.successCount}, Fallos: ${response.failureCount}.`
          : `Successfully sent notifications. Success: ${response.successCount}.`,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };

    } catch (error: any) {
      console.error('Flow Error: sendPushNotificationFlow failed.', error);
      return {
        success: false,
        message: error.message || 'Failed to send push notification.',
        successCount: 0,
        failureCount: 0
      };
    }
  }
);
