'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const createSessionCookie = async (idToken: string) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error del servidor');
    }

    return response.json(); // Return the response data which includes the role
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const auth = getAuth();
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      
      // Force refresh of the token to ensure it's not expired, as per user recommendation.
      const idToken = await userCredential.user.getIdToken(true);

      const { role } = await createSessionCookie(idToken);

      toast({
        title: 'Inicio de Sesión Exitoso',
        description: 'Bienvenido de nuevo. Redirigiendo...',
      });
      
      // Redirect based on the role returned from the API
      if (role === 'admin') {
        router.push('/admin');
      } else if (role === 'customer') {
        router.push('/customer');
      } else {
        router.push('/dashboard');
      }

    } catch (error: any) {
      console.error('Full login error:', error);
      let errorMessage = 'Verifica tus credenciales e intenta de nuevo.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
          errorMessage = 'Credenciales incorrectas. Por favor, verifica tu correo y contraseña.';
      } else if (error.message) {
          errorMessage = error.message;
      }
      
      toast({
        variant: 'destructive',
        title: 'Fallo el Inicio de Sesión',
        description: errorMessage,
      });
      setLoading(false);
    }
  };

  
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm border-2">
        <CardHeader className="text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <Logo className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
          <CardDescription>
            Ingresa tu correo y contraseña para acceder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@ejemplo.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Contraseña</Label>
                   <Link
                    href="/forgot-password"
                    className="ml-auto inline-block text-sm underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Iniciar Sesión
              </Button>
            </div>
          </form>
          <div className="mt-4 text-center text-sm">
            ¿No tienes una cuenta?{' '}
            <Link href="/signup" className="underline">
              Regístrate como Comercio
            </Link>
          </div>
          <div className="mt-2 text-center text-sm">
            ¿Gestionas alquileres?{' '}
            <Link href="/signup-rental" className="underline">
              Regístrate aquí
            </Link>
          </div>
          <div className="mt-2 text-center text-sm">
            ¿Eres un cliente/inquilino?{' '}
            <Link href="/signup-customer" className="underline">
              Crea tu cuenta
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
