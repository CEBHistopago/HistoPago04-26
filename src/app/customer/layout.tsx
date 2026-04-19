'use client';

import { DashboardHeader } from '@/components/dashboard-header';
import { CustomerNav } from '@/components/customer-nav';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useInactivityLogout } from '@/hooks/use-inactivity-logout';

export default function CustomerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  // Activate inactivity logout hook
  useInactivityLogout();

  useEffect(() => {
    // If the auth state is determined and there's no user, redirect to login.
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [isUserLoading, user, router]);

  // While the auth state is loading, show a loader.
  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Verificando sesión de cliente...</p>
      </div>
    );
  }

  // If there is a user, render the customer layout.
  if (user) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen">
          <CustomerNav />
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

  // This state is shown while redirecting.
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="ml-2">Sesión no encontrada. Redirigiendo...</p>
    </div>
  );
}
