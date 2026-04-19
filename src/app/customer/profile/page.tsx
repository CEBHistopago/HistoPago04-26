'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getAuth, updateProfile as updateAuthProfile } from 'firebase/auth';
import { getMessaging, getToken } from 'firebase/messaging';
import { saveFcmToken } from '@/ai/flows/save-fcm-token-flow';
import { Loader2, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CustomerProfileSchema, CustomerProfileValues, Customer } from '@/lib/data';
import { z } from 'zod';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const phonePrefixes = ["412", "414", "416", "424", "426", "422"];
const idPrefixes = ["V", "E", "J", "G", "P"];

const CustomerProfileFormSchema = CustomerProfileSchema.omit({ phone: true }).extend({
    phonePrefix: z.string().optional(),
    phoneNumber: z.string().optional(),
}).refine(data => {
    if (data.phonePrefix || data.phoneNumber) {
        return !!data.phonePrefix && !!data.phoneNumber && data.phoneNumber.length === 7;
    }
    return true;
}, {
    message: "Debe proporcionar un prefijo y un número de 7 dígitos.",
    path: ["phoneNumber"],
});

type CustomerProfileFormValues = z.infer<typeof CustomerProfileFormSchema>;


export default function CustomerProfilePage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();
  const [isActivatingNotifications, setIsActivatingNotifications] = useState(false);

  const customerRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'customers', user.uid);
  }, [user, firestore]);

  const { data: customerData, isLoading: customerLoading } = useDoc<Customer>(customerRef);

  const form = useForm<CustomerProfileFormValues>({
    resolver: zodResolver(CustomerProfileFormSchema),
    defaultValues: {
      name: '',
      email: '',
      identificationNumber: '',
      phonePrefix: '',
      phoneNumber: '',
    }
  });

  useEffect(() => {
    if (customerData) {
      const phone = (customerData.phone || user?.phoneNumber || '').replace('+58', '');
      const prefix = phone.substring(0, 3);
      const number = phone.substring(3);
      
      form.reset({
        name: customerData.name || user?.displayName || '',
        email: customerData.email || user?.email || '',
        identificationNumber: customerData.identificationNumber || '',
        phonePrefix: phonePrefixes.includes(prefix) ? prefix : '',
        phoneNumber: number,
      });
    }
  }, [customerData, user, form]);

  const onSubmit = async (data: CustomerProfileFormValues) => {
    if (!user || !customerRef) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes iniciar sesión para actualizar tu perfil.',
      });
      return;
    }
    
    try {
        const fullPhoneNumber = data.phonePrefix && data.phoneNumber ? `+58${data.phonePrefix}${data.phoneNumber}` : '';
        // Update Firestore document
        await updateDoc(customerRef, {
            name: data.name,
            email: data.email,
            phone: fullPhoneNumber,
        });

        // Update Firebase Auth profile
        const auth = getAuth();
        if (auth.currentUser) {
            await updateAuthProfile(auth.currentUser, {
                displayName: data.name,
                email: data.email,
            });
        }
        
        toast({
            title: 'Perfil Actualizado',
            description: 'Tu información ha sido guardada correctamente.',
        });

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar',
        description: error.message || 'No se pudo guardar la información de tu perfil.',
      });
    }
  };

  const handleEnableNotifications = async () => {
    if (!user || !firebaseApp) return;

    setIsActivatingNotifications(true);
    
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({
          variant: 'destructive',
          title: 'Permiso Denegado',
          description: 'Para recibir alertas, debes habilitar las notificaciones en la configuración de tu navegador.',
        });
        setIsActivatingNotifications(false);
        return;
      }
      
      const messaging = getMessaging(firebaseApp);
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
      
      if (!vapidKey) {
          throw new Error('La configuración del servidor para notificaciones está incompleta (VAPID Key).');
      }

      const token = await getToken(messaging, { vapidKey });
      
      if (token) {
        const result = await saveFcmToken({ userId: user.uid, token: token });
        
        if (result.success) {
            toast({
              title: '¡Notificaciones Activadas!',
              description: 'Este dispositivo ahora recibirá alertas sobre tus créditos y pagos.',
            });
        } else {
            throw new Error(result.message);
        }
      } else {
        throw new Error('No se pudo generar el identificador de notificaciones para este dispositivo.');
      }
    } catch (error: any) {
      console.error("Error enabling notifications:", error);
      toast({
        variant: 'destructive',
        title: 'Error al Activar Notificaciones',
        description: error.message || 'Ocurrió un error inesperado al configurar las alertas.',
      });
    } finally {
      setIsActivatingNotifications(false);
    }
  };
  
  const isSubmitting = form.formState.isSubmitting;
  const isLoading = isUserLoading || customerLoading;

  if (isLoading) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Cargando tu perfil...</p>
        </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Mi Perfil de Cliente</CardTitle>
                        <CardDescription>
                            Aquí puedes ver y actualizar tu información personal.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                            <FormItem>
                                <Label>Nombre Completo</Label>
                                <FormControl>
                                <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="identificationNumber"
                            render={({ field }) => (
                            <FormItem>
                                <Label>Número de Identificación (Cédula/RIF)</Label>
                                <FormControl>
                                <Input {...field} readOnly disabled className="bg-muted/50"/>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                            <FormItem>
                                <Label>Correo Electrónico</Label>
                                <FormControl>
                                <Input type="email" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <div>
                            <Label>Número de Teléfono</Label>
                            <div className="mt-2 flex gap-2">
                                <FormField
                                    control={form.control}
                                    name="phonePrefix"
                                    render={({ field }) => (
                                        <FormItem className="w-1/3">
                                            <Select onValueChange={field.onChange} value={field.value || ''} disabled={isSubmitting}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Prefijo" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {phonePrefixes.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
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
                                                <Input type="tel" maxLength={7} placeholder="1234567" {...field} value={field.value || ''} disabled={isSubmitting} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </div>
            </form>
        </Form>

         <Card>
            <CardHeader>
                <CardTitle>Notificaciones</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                     <div className="space-y-0.5">
                        <Label className="text-base">
                            Notificaciones Push
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Activa las notificaciones en este navegador para recibir alertas sobre tus compromisos.
                        </p>
                    </div>
                    <Button type="button" onClick={handleEnableNotifications} disabled={isActivatingNotifications}>
                        {isActivatingNotifications ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Bell className="mr-2 h-4 w-4" />}
                        {isActivatingNotifications ? 'Activando...' : 'Activar Notificaciones'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    </div>
  )
}
