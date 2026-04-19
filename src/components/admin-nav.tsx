'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Building,
  CreditCard,
  FileText,
  QrCode,
  Mail,
  FileDigit,
  PauseCircle,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/logo';

const navItems = [
  { href: '/admin', icon: Home, label: 'Inicio Admin' },
  { href: '/admin/vendors', icon: Building, label: 'Comercios' },
  { href: '/admin/suspensions', icon: PauseCircle, label: 'Bajas y Suspensiones' },
  { href: '/admin/billing', icon: FileDigit, label: 'Facturación' },
  { href: '/admin/subscriptions', icon: CreditCard, label: 'Pagos de Suscripción' },
  { href: '/admin/templates', icon: Mail, label: 'Plantillas de Correo' },
  { href: '/admin/reports', icon: FileText, label: 'Reportes' },
  { href: '/qr-signup-vendor', icon: QrCode, label: 'QR Registro Comercio' },
  { href: '/qr-signup', icon: QrCode, label: 'QR Registro Cliente' },
];

const secondaryNavItems = [
    { href: '/dashboard', icon: Building, label: 'Volver a Vista Comercio' },
]

export function AdminNav() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r">
      <SidebarHeader>
        <Link href="/admin" className="flex items-center justify-center gap-2">
          <Logo variant="dark" className="h-14 w-auto" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex flex-col justify-between">
        <SidebarMenu>
          {navItems.map((item) => (
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
        <SidebarMenu>
          {secondaryNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                    as={Link}
                    href={item.href}
                    isActive={pathname.startsWith(item.href) && (item.href !== '/admin' || pathname === '/admin')}
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
