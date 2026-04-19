'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { useUser } from '@/firebase';
import { getAuth, signOut } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';

export function UserNav() {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  const isCustomer = pathname.startsWith('/customer');
  const profileUrl = isCustomer ? '/customer/profile' : '/dashboard/profile';

  const handleLogout = () => {
    const auth = getAuth();
    signOut(auth)
      .catch((error) => {
        console.error("Error signing out from Firebase:", error);
      })
      .finally(() => {
        // Always try to clear the server session and redirect
        fetch('/api/logout', { method: 'POST' }).finally(() => {
          router.push('/login');
        });
      });
  };


  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return names[0][0];
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-9 w-9">
            {user?.photoURL && <AvatarImage src={user.photoURL} alt="User Avatar" />}
            <AvatarFallback>{getInitials(user?.displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user?.displayName ?? 'Usuario'}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user?.email ?? 'Sin correo'}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={profileUrl}>Perfil</Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>Configuración</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          Cerrar Sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
