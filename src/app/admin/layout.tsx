'use client';

import type { ReactNode } from 'react';
import { DashboardHeader } from '@/components/dashboard-header';
import { AdminNav } from '@/components/admin-nav';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { useInactivityLogout } from '@/hooks/use-inactivity-logout';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';


export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  // Activate inactivity logout hook for this layout
  useInactivityLogout();

  useEffect(() => {
    // If the auth state is determined and there's no user, redirect to login.
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Verificando sesión de administrador...</p>
      </div>
    );
  }

  if (user) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen">
          <AdminNav />
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

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="ml-2">Sesión no encontrada. Redirigiendo...</p>
    </div>
  );
}
