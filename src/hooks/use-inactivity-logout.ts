'use client';

import { useEffect, useCallback } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

export function useInactivityLogout() {
  const router = useRouter();
  const { toast } = useToast();

  const logout = useCallback(() => {
    const auth = getAuth();
    // Only proceed if there's a user session to end
    if (auth.currentUser) {
      toast({
        title: 'Sesión Cerrada por Inactividad',
        description: 'Hemos cerrado tu sesión para proteger tu cuenta.',
      });

      // Proceed with standard logout
      signOut(auth)
        .catch((error) => {
          console.error("Error signing out for inactivity:", error);
        })
        .finally(() => {
          // Always try to clear server session and redirect
          fetch('/api/logout', { method: 'POST' }).finally(() => {
            router.push('/login');
          });
        });
    }
  }, [router, toast]);

  useEffect(() => {
    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(logout, INACTIVITY_TIMEOUT);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll'];

    // Add event listeners
    events.forEach(event => window.addEventListener(event, resetTimer));

    // Initialize timer
    resetTimer();

    // Cleanup function
    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [logout]);
}
