'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function QrSignupVendorPage() {
  const router = useRouter();
  const [signupUrl, setSignupUrl] = useState('');

  useEffect(() => {
    // Ensure this runs only on the client where `window.location` is available
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/signup`;
      setSignupUrl(url);
    }
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex items-center justify-center gap-2">
            <Logo className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl">Registro de Comercios</CardTitle>
          <CardDescription>
            Escanea el código QR para registrar un nuevo comercio en HistoPago.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <div className="rounded-lg bg-white p-4">
            {signupUrl ? (
              <QRCode
                value={signupUrl}
                size={256}
                viewBox={`0 0 256 256`}
              />
            ) : (
              <div className="h-64 w-64 animate-pulse rounded-md bg-gray-200" />
            )}
          </div>
          <Button onClick={() => router.back()} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
