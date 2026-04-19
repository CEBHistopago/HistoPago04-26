'use client';

import Link from 'next/link';
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
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, email);
      setSubmitted(true);
      toast({
        title: 'Correo de Recuperación Enviado',
        description: 'Revisa tu bandeja de entrada para restablecer tu contraseña.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
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
          <CardTitle className="text-2xl">¿Olvidaste tu Contraseña?</CardTitle>
          <CardDescription>
            {submitted
              ? 'Si existe una cuenta para ese correo, se ha enviado un enlace de recuperación.'
              : 'Introduce tu correo y te enviaremos un enlace para restablecer tu contraseña.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!submitted ? (
            <form onSubmit={handleResetPassword}>
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
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Enlace
                </Button>
              </div>
            </form>
          ) : (
             <Button className="w-full" asChild>
                <Link href="/login">Volver a Iniciar Sesión</Link>
            </Button>
          )}
          <div className="mt-4 text-center text-sm">
            ¿Recordaste tu contraseña?{' '}
            <Link href="/login" className="underline">
              Iniciar Sesión
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
