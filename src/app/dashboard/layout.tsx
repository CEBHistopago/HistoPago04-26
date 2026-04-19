'use client';

import { DashboardHeader } from '@/components/dashboard-header';
import { DashboardNav } from '@/components/dashboard-nav';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useInactivityLogout } from '@/hooks/use-inactivity-logout';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  // Activate inactivity logout hook for this layout
  useInactivityLogout();

  useEffect(() => {
    // If the user check is done and there's no user, redirect to login.
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [isUserLoading, user, router]);


  // While checking for the user, show a loader.
  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Verificando sesión...</p>
      </div>
    );
  }
  
  // If there's a user, show the dashboard.
  if (user) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen">
          <DashboardNav />
          <SidebarInset className="flex-1">
            <div className="flex flex-col">
              <DashboardHeader />
              <main className="flex-1 p-4 md:p-6">{children}</main>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  // If no user and no longer loading, this will be briefly shown before redirection.
  return (
    <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Redirigiendo a inicio de sesión...</p>
      </div>
  );
}
