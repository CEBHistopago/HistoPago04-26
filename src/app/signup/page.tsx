'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, Timestamp } from 'firebase/firestore';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';

const phonePrefixes = ["412", "414", "416", "424", "426", "422"];
const idPrefixes = ["V", "E", "J", "G", "P"];

export default function SignupPage() {
  const { toast } = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [idPrefix, setIdPrefix] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (password.length < 6) {
        toast({
            variant: 'destructive',
            title: 'Fallo el Registro',
            description: 'La contraseña debe tener al menos 6 caracteres.',
        });
        setLoading(false);
        return;
    }

    if (!idPrefix || !idNumber || idNumber.length < 6) {
        toast({
            variant: 'destructive',
            title: 'Identificación Requerida',
            description: 'Por favor, introduce un RIF o Cédula válido.',
        });
        setLoading(false);
        return;
    }

    if (!phonePrefix || phoneNumber.length !== 7) {
        toast({
            variant: 'destructive',
            title: 'Teléfono Inválido',
            description: 'Por favor, introduce un número de teléfono válido de 7 dígitos.',
        });
        setLoading(false);
        return;
    }

    try {
      const auth = getAuth();
      const firestore = getFirestore(auth.app);
      
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      
      const user = userCredential.user;

      if (user) {
        await updateProfile(user, {
            displayName: fullName,
        });

        const fullPhoneNumber = `+58${phonePrefix}${phoneNumber}`;
        const fullIdentification = `${idPrefix}-${idNumber}`;

        const vendorDocRef = doc(firestore, 'vendors', user.uid);
        await setDoc(vendorDocRef, {
          id: user.uid,
          name: fullName,
          email: user.email,
          identificationNumber: fullIdentification,
          role: 'vendor',
          plan: 'HistoGestion',
          address: '',
          phone: fullPhoneNumber,
          legalRepName: '',
          legalRepAddress: '',
          legalRepPhone: '',
          legalRepEmail: '',
          creationDate: Timestamp.now(),
          status: 'Activo',
          subscriptionEndDate: Timestamp.fromDate(new Date(new Date().setMonth(new Date().getMonth() + 1))),
          isRegistered: true, // Marca fundamental para estadísticas de acceso
        });
      }

      toast({
        title: 'Cuenta Creada',
        description: "Hemos creado tu cuenta de comercio exitosamente.",
      });

      router.push('/login');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Fallo el Registro',
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
          <CardTitle className="text-2xl">Registro de Comercio</CardTitle>
          <CardDescription>
            Ingresa tu información para crear una cuenta de comercio profesional
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="full-name">Nombre del Comercio o Razón Social</Label>
                <Input
                  id="full-name"
                  placeholder="Mi Negocio C.A."
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                />
              </div>
              
              <div className="grid gap-2">
                <Label>RIF o Cédula del Comercio</Label>
                <div className="flex gap-2">
                  <Select onValueChange={setIdPrefix} value={idPrefix} disabled={loading}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {idPrefixes.map(prefix => (
                        <SelectItem key={prefix} value={prefix}>{prefix}-</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="12345678"
                    required
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))}
                    disabled={loading}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="comercio@ejemplo.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="grid gap-2">
                <Label>Teléfono de Contacto (WhatsApp)</Label>
                <div className="flex gap-2">
                  <Select onValueChange={setPhonePrefix} value={phonePrefix} disabled={loading}>
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Prefijo" />
                    </SelectTrigger>
                    <SelectContent>
                      {phonePrefixes.map(prefix => (
                        <SelectItem key={prefix} value={prefix}>{prefix}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="tel"
                    placeholder="1234567"
                    maxLength={7}
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                    disabled={loading}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox id="terms" checked={agreed} onCheckedChange={(checked) => setAgreed(checked as boolean)} />
                <label
                  htmlFor="terms"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Acepto los{' '}
                  <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
                    términos y condiciones
                  </Link>
                </label>
              </div>
              <Button type="submit" className="w-full" disabled={loading || !agreed}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar Comercio
              </Button>
            </div>
          </form>
          <div className="mt-4 text-center text-sm">
            ¿Gestionas alquileres?{' '}
            <Link href="/signup-rental" className="underline font-semibold">
              Regístrate aquí
            </Link>
          </div>
          <div className="mt-2 text-center text-sm">
            ¿Ya tienes una cuenta?{' '}
            <Link href="/login" className="underline">
              Iniciar Sesión
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
