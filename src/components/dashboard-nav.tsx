'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DollarSign,
  LayoutDashboard,
  Users,
  UserSearch,
  FileText,
  User,
  Shield,
  ShieldCheck,
  Upload,
  CreditCard,
  BookText,
} from 'lucide-react';
import { useFirestore, useDoc, useMemoFirebase, useUser } from '@/firebase';
import { doc } from 'firebase/firestore';
import type { Vendor } from '@/lib/data';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', plans: ['HistoGestion', 'HistoAlquiler'] },
  { href: '/dashboard/sales', icon: DollarSign, label: 'Ventas', plans: ['HistoGestion', 'HistoAlquiler'] },
  { href: '/dashboard/clients', icon: Users, label: 'Clientes', plans: ['HistoGestion', 'HistoAlquiler'] },
  { href: '/dashboard/payment-verification', icon: ShieldCheck, label: 'Verificar Pagos', plans: ['HistoGestion', 'HistoAlquiler'] },
  { href: '/dashboard/verification', icon: UserSearch, label: 'Consultar Cliente', plans: ['HistoGestion'] },
  { href: '/dashboard/bulk-import', icon: Upload, label: 'Carga Masiva', plans: ['HistoGestion'] },
  { href: '/dashboard/reports', icon: FileText, label: 'Reportes', plans: ['HistoGestion', 'HistoAlquiler'] },
];

const secondaryNavItems = [
    { href: '/dashboard/api-docs', icon: BookText, label: 'Documentación API' },
    { href: '/dashboard/subscription', icon: CreditCard, label: 'Suscripción' },
    { href: '/dashboard/profile', icon: User, label: 'Perfil del Comercio' },
]

export function DashboardNav() {
  const pathname = usePathname();
  const { user } = useUser();
  const firestore = useFirestore();

  const vendorRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'vendors', user.uid);
  }, [user, firestore]);

  const { data: vendorData } = useDoc<Vendor>(vendorRef);
  const isAdmin = vendorData?.role === 'admin';
  
  // Robust plan normalization: Treat anything other than 'HistoAlquiler' as 'HistoGestion'.
  // This handles old 'Comercio' values, undefined, or any other inconsistencies.
  const rawPlan = vendorData?.plan;
  const vendorPlan = rawPlan === 'HistoAlquiler' ? 'HistoAlquiler' : 'HistoGestion';
  const isRentalPlan = vendorPlan === 'HistoAlquiler';

  return (
    <Sidebar className="border-r">
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center justify-center gap-2">
          <Logo variant="dark" className="h-14 w-auto" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex flex-col justify-between">
        <SidebarMenu>
          {navItems.filter(item => {
            if (isRentalPlan) {
              return !['/dashboard/verification', '/dashboard/bulk-import'].includes(item.href);
            }
            // The core fix: vendorPlan is now normalized, so this check will always work correctly.
            return isAdmin || item.plans.includes(vendorPlan)
          }).map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                as={Link}
                href={item.href}
                isActive={pathname.startsWith(item.href) && (item.href !== '/dashboard' || pathname === '/dashboard')}
                className={cn('justify-start')}
              >
                <item.icon className="h-4 w-4" />
                <span>
                  {isRentalPlan && item.label === 'Ventas'
                    ? 'Contratos'
                    : isRentalPlan && item.label === 'Clientes'
                    ? 'Inquilinos'
                    : item.label}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <SidebarMenu>
          {isAdmin && (
            <>
              <SidebarSeparator />
              <SidebarMenuItem>
                  <SidebarMenuButton
                      as={Link}
                      href="/admin"
                      className={cn('justify-start bg-sidebar-accent/10 text-sidebar-accent-foreground hover:bg-sidebar-accent/20')}
                  >
                      <Shield className="h-4 w-4" />
                      <span>Ir al Panel de Admin</span>
                  </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarSeparator />
            </>
          )}
          {secondaryNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                    as={Link}
                    href={item.href}
                    isActive={pathname === item.href}
                    className={cn('justify-start')}
                >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
