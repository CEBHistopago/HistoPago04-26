'use client';

import { useEffect } from 'react';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { useFirebaseApp, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { saveFcmToken } from '@/ai/flows/save-fcm-token-flow';

export function FirebaseMessagingProvider({ children }: { children: React.ReactNode }) {
  const { firebaseApp } = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    // This effect runs only when a user is authenticated.
    if (!user) {
      return;
    }

    const requestPermissionAndSyncToken = async () => {
      console.log('[FCM] User detected. Starting notification permission process...');
      
      const isSupportedClient = await isSupported();
      if (!isSupportedClient) {
        console.warn('[FCM] Push notifications are not supported in this browser.');
        return;
      }
      if (!firebaseApp) {
        console.error('[FCM] Firebase app not ready.');
        return;
      }
      if (!process.env.NEXT_PUBLIC_VAPID_KEY) {
        console.error('[FCM] VAPID key is missing. Notifications will fail.');
        return;
      }

      try {
        console.log(`[FCM] Current permission status: ${Notification.permission}`);
        const messaging = getMessaging(firebaseApp);
        
        // getToken will automatically request permission if it's 'default'.
        // It's the most reliable way to trigger the prompt.
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
        });

        if (currentToken) {
          console.log('[FCM] Token received successfully:', currentToken);
          console.log(`[FCM] Saving token for user ${user.uid}...`);
          
          // The server now handles figuring out the user's role/collection.
          await saveFcmToken({ userId: user.uid, token: currentToken });
          console.log('[FCM] Token save-to-backend initiated.');

        } else {
          // This can happen if the user denies permission.
          console.warn('[FCM] No registration token available. This may happen if permission was denied just now.');
        }
      } catch (err: any) {
        console.error('[FCM] Error during token retrieval or saving:', err);
        // Specifically check for permission-related errors to inform the user.
        if (err.code === 'messaging/permission-blocked') {
          toast({
            title: 'Notificaciones Bloqueadas',
            description: 'Para recibir alertas, habilita las notificaciones para este sitio en la configuración de tu navegador.',
            duration: 10000,
          });
        }
      }
    };
    
    requestPermissionAndSyncToken();

  }, [user, firebaseApp, toast]);

  return <>{children}</>;
}
