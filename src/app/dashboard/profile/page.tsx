'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { VendorProfileValues, Vendor, VendorProfileSchema } from '@/lib/data';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase, useFirebaseApp } from '@/firebase';
import { doc } from 'firebase/firestore';
import { updateVendorProfileClient } from '@/ai/flows/vendor-profile-flow';
import { getMessaging, getToken } from 'firebase/messaging';
import { saveFcmToken } from '@/ai/flows/save-fcm-token-flow';
import { Loader2, Bell, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { z } from 'zod';
import { format } from 'date-fns';

const phonePrefixes = ["412", "414", "416", "424", "426", "422"];
const idPrefixes = ["V", "E", "J", "G", "P"];

const VendorProfileFormSchema = VendorProfileSchema.omit({
  phone: true,
  legalRepPhone: true,
}).extend({
  phonePrefix: z.string().optional(),
  phoneNumber: z.string().optional(),
  legalRepPhonePrefix: z.string().optional(),
  legalRepPhoneNumber: z.string().optional(),
})
.refine(data => {
    if (data.phonePrefix || data.phoneNumber) {
        return !!data.phonePrefix && !!data.phoneNumber && data.phoneNumber.length === 7;
    }
    return true;
}, {
    message: "Prefijo y número de 7 dígitos son requeridos.",
    path: ["phoneNumber"],
})
.refine(data => {
    if (data.legalRepPhonePrefix || data.legalRepPhoneNumber) {
        return !!data.legalRepPhonePrefix && !!data.legalRepPhoneNumber && data.legalRepPhoneNumber.length === 7;
    }
    return true;
}, {
    message: "Prefijo y número de 7 dígitos son requeridos.",
    path: ["legalRepPhoneNumber"],
});

type VendorProfileFormValues = z.infer<typeof VendorProfileFormSchema>;


export default function ProfilePage() {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const firebaseApp = useFirebaseApp();
  const { toast } = useToast();

  const vendorRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'vendors', user.uid);
  }, [user, firestore]);

  const { data: vendorData, isLoading: vendorLoading } = useDoc<Vendor>(vendorRef);

  const [idPrefix, setIdPrefix] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [legalRepIdPrefix, setLegalRepIdPrefix] = useState('');
  const [legalRepIdNumber, setLegalRepIdNumber] = useState('');
  const [isActivatingNotifications, setIsActivatingNotifications] = useState(false);

  const form = useForm<VendorProfileFormValues>({
    resolver: zodResolver(VendorProfileFormSchema),
    defaultValues: {
      name: '',
      email: '',
      identificationNumber: '',
      address: '',
      phonePrefix: '',
      phoneNumber: '',
      legalRepName: '',
      legalRepIdentificationNumber: '',
      legalRepAddress: '',
      legalRepPhonePrefix: '',
      legalRepPhoneNumber: '',
      legalRepEmail: '',
      enableDailyReport: false,
      reminderDaysBefore: 2,
    }
  });

  useEffect(() => {
    if (vendorData) {
      const phone = (vendorData.phone || '').replace('+58', '');
      const phonePrefixValue = phone.substring(0, 3);
      const phoneNumberValue = phone.substring(3);

      const legalRepPhone = (vendorData.legalRepPhone || '').replace('+58', '');
      const legalRepPhonePrefixValue = legalRepPhone.substring(0, 3);
      const legalRepPhoneNumberValue = legalRepPhone.substring(3);

      form.reset({
        name: vendorData.name || user?.displayName || '',
        email: vendorData.email || user?.email || '',
        identificationNumber: vendorData.identificationNumber || '',
        address: vendorData.address || '',
        phonePrefix: phonePrefixes.includes(phonePrefixValue) ? phonePrefixValue : '',
        phoneNumber: phoneNumberValue,
        legalRepName: vendorData.legalRepName || '',
        legalRepIdentificationNumber: vendorData.legalRepIdentificationNumber || '',
        legalRepAddress: vendorData.legalRepAddress || '',
        legalRepPhonePrefix: phonePrefixes.includes(legalRepPhonePrefixValue) ? legalRepPhonePrefixValue : '',
        legalRepPhoneNumber: legalRepPhoneNumberValue,
        legalRepEmail: vendorData.legalRepEmail || '',
        enableDailyReport: vendorData.enableDailyReport || false,
        reminderDaysBefore: vendorData.reminderDaysBefore || 2,
      });

      if (vendorData.identificationNumber) {
        const [prefix, ...numberParts] = vendorData.identificationNumber.split('-');
        setIdPrefix(prefix);
        setIdNumber(numberParts.join('-'));
      }
      if (vendorData.legalRepIdentificationNumber) {
        const [prefix, ...numberParts] = vendorData.legalRepIdentificationNumber.split('-');
        setLegalRepIdPrefix(prefix);
        setLegalRepIdNumber(numberParts.join('-'));
      }
    }
  }, [vendorData, user, form]);

  const onSubmit = async (data: VendorProfileFormValues) => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes iniciar sesión para actualizar tu perfil.',
      });
      return;
    }
    
    try {
        const fullId = idPrefix && idNumber ? `${idPrefix}-${idNumber}` : '';
        const fullLegalRepId = legalRepIdPrefix && legalRepIdNumber ? `${legalRepIdPrefix}-${legalRepIdNumber}` : '';
        const fullPhoneNumber = data.phonePrefix && data.phoneNumber ? `+58${data.phonePrefix}${data.phoneNumber}` : '';
        const fullLegalRepPhoneNumber = data.legalRepPhonePrefix && data.legalRepPhoneNumber ? `+58${data.legalRepPhonePrefix}${data.legalRepPhoneNumber}` : '';


        const profileDataForFlow: VendorProfileValues = {
            name: data.name,
            email: data.email,
            identificationNumber: fullId,
            address: data.address,
            phone: fullPhoneNumber,
            legalRepName: data.legalRepName,
            legalRepIdentificationNumber: fullLegalRepId,
            legalRepAddress: data.legalRepAddress,
            legalRepPhone: fullLegalRepPhoneNumber,
            legalRepEmail: data.legalRepEmail,
            enableDailyReport: data.enableDailyReport,
            reminderDaysBefore: data.reminderDaysBefore,
        };

        const result = await updateVendorProfileClient({
            vendorId: user.uid,
            profileData: profileDataForFlow
        });

        if (result.success) {
            toast({
                title: 'Perfil Actualizado',
                description: 'La información de tu comercio ha sido guardada.',
            });
        } else {
            throw new Error(result.message);
        }

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar',
        description: error.message || 'No se pudo guardar el perfil.',
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
          description: 'Habilita las notificaciones en tu navegador para recibir alertas importantes.',
        });
        setIsActivatingNotifications(false);
        return;
      }
      
      const messaging = getMessaging(firebaseApp);
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
      
      if (!vapidKey) {
          throw new Error('Configuración de notificaciones incompleta en el servidor.');
      }

      const token = await getToken(messaging, { vapidKey });
      
      if (token) {
        const result = await saveFcmToken({ userId: user.uid, token });
        
        if (result.success) {
            toast({
              title: '¡Notificaciones Activadas!',
              description: 'Este dispositivo ahora recibirá alertas importantes de tu cuenta.',
            });
        } else {
            throw new Error(result.message);
        }
      } else {
        throw new Error('No se pudo obtener el token de notificación.');
      }
    } catch (error: any) {
      console.error("Error enabling notifications:", error);
      toast({
        variant: 'destructive',
        title: 'Error al Activar Notificaciones',
        description: error.message || 'Ocurrió un error inesperado al configurar el dispositivo.',
      });
    } finally {
      setIsActivatingNotifications(false);
    }
  };
  
  const isSubmitting = form.formState.isSubmitting;
  const isLoading = userLoading || vendorLoading;

  if (isLoading) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Cargando perfil...</p>
        </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <Card>
                <CardHeader>
                    <CardTitle>Perfil del Comercio</CardTitle>
                    <CardDescription>
                    Esta es la información que se mostrará en los reportes y futuras facturas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre del Comercio o Razón Social</FormLabel>
                                <FormControl>
                                <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <div>
                            <Label>RIF o Cédula del Comercio</Label>
                            <div className="flex gap-2 mt-2">
                                <Select value={idPrefix} onValueChange={setIdPrefix}>
                                    <SelectTrigger className="w-1/3">
                                        <SelectValue placeholder="Prefijo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {idPrefixes.map(prefix => <SelectItem key={prefix} value={prefix}>{prefix}-</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="12345678" />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Correo Electrónico Principal</FormLabel>
                                <FormControl>
                                <Input type="email" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                         <div>
                            <Label>Teléfono de Contacto del Comercio</Label>
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
                                            {phonePrefixes.map((prefix) => (
                                            <SelectItem key={prefix} value={prefix}>
                                                {prefix}
                                            </SelectItem>
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
                                        <Input type="tel" maxLength={7} placeholder="1234567" {...field} value={field.value || ''} disabled={isSubmitting} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                            </div>
                         </div>
                    </div>
                    <FormField
                        control={form.control}
                        name="address"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Dirección Fiscal del Comercio</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
                </Card>

                <Card>
                <CardHeader>
                    <CardTitle>Representante Legal</CardTitle>
                    <CardDescription>
                    Información de la persona de contacto o representante legal del comercio.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="legalRepName"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nombre Completo</FormLabel>
                                <FormControl>
                                <Input {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                         <div>
                            <Label>Cédula del Rep. Legal</Label>
                            <div className="flex gap-2 mt-2">
                                <Select value={legalRepIdPrefix} onValueChange={setLegalRepIdPrefix}>
                                    <SelectTrigger className="w-1/3">
                                        <SelectValue placeholder="Prefijo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {idPrefixes.filter(p => p === 'V' || p === 'E').map(prefix => <SelectItem key={prefix} value={prefix}>{prefix}-</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Input value={legalRepIdNumber} onChange={e => setLegalRepIdNumber(e.target.value)} placeholder="12345678" />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="legalRepEmail"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>Correo Electrónico</FormLabel>
                                <FormControl>
                                <Input type="email" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                         <div>
                            <Label>Teléfono</Label>
                            <div className="mt-2 flex gap-2">
                                <FormField
                                    control={form.control}
                                    name="legalRepPhonePrefix"
                                    render={({ field }) => (
                                    <FormItem className="w-1/3">
                                        <Select onValueChange={field.onChange} value={field.value || ''} disabled={isSubmitting}>
                                        <FormControl>
                                            <SelectTrigger>
                                            <SelectValue placeholder="Prefijo" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {phonePrefixes.map((prefix) => (
                                            <SelectItem key={prefix} value={prefix}>
                                                {prefix}
                                            </SelectItem>
                                            ))}
                                        </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="legalRepPhoneNumber"
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
                    </div>
                    <FormField
                        control={form.control}
                        name="legalRepAddress"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Dirección</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Configuración de Cobranza</CardTitle>
                        <CardDescription>Personaliza cuándo y cómo se gestionan tus cobros automáticos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <FormField
                            control={form.control}
                            name="reminderDaysBefore"
                            render={({ field }) => (
                                <FormItem className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-primary" />
                                            <FormLabel className="text-base">Antelación de Recordatorio Amistoso</FormLabel>
                                        </div>
                                        <FormDescription>
                                            Define cuántos días antes del vencimiento se enviará el primer mensaje preventivo.
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Select onValueChange={field.onChange} value={field.value?.toString()}>
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue placeholder="Seleccionar días" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(days => (
                                                    <SelectItem key={days} value={days.toString()}>{days} día{days > 1 ? 's' : ''} antes</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <FormField
                        control={form.control}
                        name="enableDailyReport"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">
                                        Reporte Diario de Cobranza
                                    </FormLabel>
                                    <FormDescription>
                                        Recibir un correo electrónico cada mañana con un resumen de las cuotas vencidas y por vencer.
                                    </FormDescription>
                                </div>
                                <FormControl>
                                    <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                        />
                        <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                             <div className="space-y-0.5">
                                <Label className="text-base">
                                    Notificaciones Push
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Activa las notificaciones en este navegador para recibir alertas importantes de tu cuenta.
                                </p>
                            </div>
                            <Button type="button" onClick={handleEnableNotifications} disabled={isActivatingNotifications}>
                                {isActivatingNotifications ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Bell className="mr-2 h-4 w-4" />}
                                {isActivatingNotifications ? 'Activando...' : 'Activar Notificaciones'}
                            </Button>
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
    </div>
  )
}
