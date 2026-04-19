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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomerAccount } from '@/ai/flows/create-customer-flow';
import { Logo } from '@/components/logo';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Zod schema for client-side validation
const signupSchema = z.object({
  fullName: z.string().min(1, 'El nombre es requerido.'),
  idPrefix: z.string().min(1, 'Selecciona un prefijo.'),
  idNumber: z.string().min(7, 'El número de identificación debe tener al menos 7 dígitos.'),
  email: z.string().email('El correo no es válido.'),
  phonePrefix: z.string().min(3, "Selecciona un prefijo."),
  phoneNumber: z.string().length(7, "El número debe tener 7 dígitos."),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
  agreed: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar los términos y condiciones.' }),
  }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

const phonePrefixes = ["412", "414", "416", "424", "426", "422"];
const idPrefixes = ["V", "E", "J", "G", "P"];

export default function SignupCustomerPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
        fullName: '',
        idPrefix: '',
        idNumber: '',
        email: '',
        phonePrefix: '',
        phoneNumber: '',
        password: '',
        agreed: false,
    }
  });


  const handleSignup = async (data: SignupFormValues) => {
    setLoading(true);

    const fullPhoneNumber = `+58${data.phonePrefix}${data.phoneNumber}`;
    const fullIdentificationNumber = `${data.idPrefix}-${data.idNumber}`;

    try {
        const result = await createCustomerAccount({ 
            fullName: data.fullName,
            email: data.email, 
            password: data.password, 
            identificationNumber: fullIdentificationNumber,
            phone: fullPhoneNumber
        });

        if (result.success) {
            toast({
                title: 'Cuenta de Cliente Creada',
                description: 'Hemos creado tu cuenta. Ahora puedes iniciar sesión.',
            });
            router.push('/login');
        } else {
            throw new Error(result.message);
        }

    } catch (error: any) {
        console.error("Signup error:", error);
        toast({
            variant: 'destructive',
            title: 'Fallo el Registro',
            description: error.message || "Ocurrió un error inesperado.",
        });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-md border-2">
        <CardHeader className="text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <Logo className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl">Registro de Cliente</CardTitle>
          <CardDescription>
            Crea tu cuenta para consultar tu historial de crédito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSignup)} className="space-y-6">
                <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nombre Completo</FormLabel>
                            <FormControl>
                                <Input placeholder="John Doe" {...field} disabled={loading} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div>
                  <Label>Cédula o RIF</Label>
                  <div className="flex gap-2 mt-2">
                    <FormField
                      control={form.control}
                      name="idPrefix"
                      render={({ field }) => (
                        <FormItem className="w-1/3">
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loading}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Prefijo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {idPrefixes.map(prefix => (
                                <SelectItem key={prefix} value={prefix}>{prefix}-</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="idNumber"
                      render={({ field }) => (
                        <FormItem className="w-2/3">
                          <FormControl>
                            <Input 
                                type="text" 
                                placeholder="12345678"
                                {...field} 
                                disabled={loading} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                 <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Correo Electrónico</FormLabel>
                            <FormControl>
                                <Input type="email" placeholder="m@ejemplo.com" {...field} disabled={loading} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <div>
                  <Label>Número de Teléfono</Label>
                  <div className="flex gap-2 mt-2">
                    <FormField
                      control={form.control}
                      name="phonePrefix"
                      render={({ field }) => (
                        <FormItem className="w-1/3">
                          <Select onValueChange={field.onChange} defaultValue={field.value} disabled={loading}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Prefijo" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {phonePrefixes.map(prefix => (
                                <SelectItem key={prefix} value={prefix}>{prefix}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phoneNumber"
                      render={({ field }) => (
                        <FormItem className="w-2/3">
                          <FormControl>
                            <Input 
                                type="tel" 
                                placeholder="1234567"
                                maxLength={7}
                                {...field} 
                                disabled={loading} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                 <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Contraseña</FormLabel>
                            <FormControl>
                                <Input type="password" {...field} disabled={loading} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="agreed"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    disabled={loading}
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel>
                                    Acepto los{' '}
                                    <Link href="/terms" className="underline underline-offset-4 hover:text-primary">
                                        términos y condiciones
                                    </Link>
                                </FormLabel>
                                <FormMessage />
                            </div>
                        </FormItem>
                    )}
                />
                <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear mi cuenta
                </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
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
