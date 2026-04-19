'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CreditCard,
  User,
  Calculator,
  ShieldCheck,
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
  { href: '/customer', icon: LayoutDashboard, label: 'Resumen de Cuenta' },
  { href: '/customer/commitments', icon: CreditCard, label: 'Mis Compromisos' },
  { href: '/customer/calculator', icon: Calculator, label: 'Calculadora' },
  { href: '/customer/certified-report', icon: ShieldCheck, label: 'Reporte Certificado' },
  { href: '/customer/profile', icon: User, label: 'Mi Perfil' },
];

export function CustomerNav() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r">
      <SidebarHeader>
        <Link href="/customer" className="flex items-center justify-center gap-2">
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
                isActive={pathname.startsWith(item.href) && (item.href !== '/customer' || pathname === '/customer')}
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
