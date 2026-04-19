'use client';

import { useEffect, useCallback } from 'react';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { useFirebaseApp, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { saveFcmToken } from '@/ai/flows/save-fcm-token-flow';

export function FirebaseMessagingProvider({ children }: { children: React.ReactNode }) {
  const { firebaseApp } = useFirebaseApp();
  const { user } = useUser();
  const { toast } = useToast();

  useEffect(() => {
    const requestPermissionAndSyncToken = async () => {
      // Pre-flight checks
      const isSupportedClient = await isSupported();
      if (!isSupportedClient) {
        console.log('[FCM] Push notifications are not supported in this browser.');
        return;
      }
      if (!firebaseApp) {
        console.log('[FCM] Firebase app not ready.');
        return;
      }
      if (!process.env.NEXT_PUBLIC_VAPID_KEY) {
        console.error('[FCM] VAPID key is missing. Notifications will fail.');
        return;
      }

      try {
        const messaging = getMessaging(firebaseApp);
        console.log('[FCM] Attempting to get token...');
        
        // getToken will automatically request permission if it's 'default'.
        // It will throw an error if permission is 'denied'.
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_VAPID_KEY,
        });

        if (currentToken) {
          console.log('[FCM] Token received:', currentToken);
          // Save the token to the backend
          if (user) {
            const cookies = document.cookie.split('; ');
            const roleCookie = cookies.find(row => row.startsWith('userRole='));
            const role = roleCookie ? roleCookie.split('=')[1] : null;

            if (role === 'vendor' || role === 'customer' || role === 'admin') {
              console.log(`[FCM] Saving token for user ${user.uid} with role ${role}...`);
              await saveFcmToken({ userId: user.uid, token: currentToken, role: role as any });
              console.log('[FCM] Token save-to-backend initiated.');
            } else {
              console.warn('[FCM] User role not found in cookies. Cannot save token.');
            }
          } else {
            console.log('[FCM] User not logged in. Token not saved to backend.');
          }
        } else {
          // This case is unlikely if permission is granted, but good to have.
          console.warn('[FCM] No registration token available. This may happen if permission was denied.');
        }
      } catch (err: any) {
        console.error('[FCM] Error during token retrieval:', err);
        if (err.code === 'messaging/permission-blocked' || err.code === 'messaging/permission-default') {
          toast({
            title: 'Notificaciones Bloqueadas',
            description: 'Para recibir alertas, por favor habilita las notificaciones para este sitio en la configuración de tu navegador.',
            duration: 10000,
          });
        }
      }
    };
    
    // We only try to get the token once the user is logged in.
    if (user) {
      requestPermissionAndSyncToken();
    }
  }, [user, firebaseApp, toast]);

  return <>{children}</>;
}
