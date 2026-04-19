'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Vendor, VendorProfileSchema, VendorProfileValues } from '@/lib/data';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Loader2, Copy, KeyRound, Bell, CheckCircle } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { updateVendorProfile } from '@/ai/flows/update-vendor-profile-flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { generateApiKeyForVendor } from '@/ai/flows/generate-api-key-flow';
import { sendPushNotification } from '@/ai/flows/send-push-notification-flow';
import { confirmPendingSalesForVendor } from '@/ai/flows/confirm-pending-sales-flow';
import { format } from 'date-fns';

const idPrefixes = ["V", "E", "J", "G", "P"];

export default function EditVendorPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const vendorId = params.vendorId as string;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [idPrefix, setIdPrefix] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [legalRepIdPrefix, setLegalRepIdPrefix] = useState('');
  const [legalRepIdNumber, setLegalRepIdNumber] = useState('');
  
  const [apiKey, setApiKey] = useState('');
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isConfirmingSales, setIsConfirmingSales] = useState(false);

  const vendorRef = useMemoFirebase(() => {
    if (!firestore || !vendorId) return null;
    return doc(firestore, 'vendors', vendorId);
  }, [firestore, vendorId]);
  
  const form = useForm<VendorProfileValues>({
    resolver: zodResolver(VendorProfileSchema),
    defaultValues: {
        name: '',
        email: '',
        identificationNumber: '',
        address: '',
        phone: '',
        legalRepName: '',
        legalRepIdentificationNumber: '',
        legalRepAddress: '',
        legalRepPhone: '',
        legalRepEmail: '',
        creationDate: '',
        reminderDaysBefore: 2,
    }
  });

  const formatDateForInput = (date: any) => {
    if (!date) return '';
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return format(d, 'yyyy-MM-dd');
  };

  useEffect(() => {
    const fetchVendor = async () => {
        if (!vendorRef) return;
        setIsLoading(true);
        try {
            const docSnap = await getDoc(vendorRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as Vendor;
                setVendor(data);
                setApiKey(data.apiKey || '');
                form.reset({
                    name: data.name || '',
                    email: data.email || '',
                    identificationNumber: data.identificationNumber || '',
                    address: data.address || '',
                    phone: data.phone || '',
                    legalRepName: data.legalRepName || '',
                    legalRepIdentificationNumber: data.legalRepIdentificationNumber || '',
                    legalRepAddress: data.legalRepAddress || '',
                    legalRepPhone: data.legalRepPhone || '',
                    legalRepEmail: data.legalRepEmail || '',
                    creationDate: data.creationDate ? formatDateForInput(data.creationDate) : '',
                    reminderDaysBefore: data.reminderDaysBefore || 2,
                });

                if (data.identificationNumber) {
                    const [prefix, ...numberParts] = data.identificationNumber.split('-');
                    setIdPrefix(prefix);
                    setIdNumber(numberParts.join('-'));
                }
                if (data.legalRepIdentificationNumber) {
                    const [prefix, ...numberParts] = data.legalRepIdentificationNumber.split('-');
                    setLegalRepIdPrefix(prefix);
                    setLegalRepIdNumber(numberParts.join('-'));
                }

            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Comercio no encontrado.' });
                router.push('/admin/vendors');
            }
        } catch (error) {
            console.error("Error fetching vendor:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la información del comercio.' });
        } finally {
            setIsLoading(false);
        }
    }
    fetchVendor();
  }, [vendorRef, toast, router, form]);


  const onSubmit = async (data: VendorProfileValues) => {
    if (!vendorId) return;
    setIsSubmitting(true);
    
    try {
      const fullId = idPrefix && idNumber ? `${idPrefix}-${idNumber}` : '';
      const fullLegalRepId = legalRepIdPrefix && legalRepIdNumber ? `${legalRepIdPrefix}-${legalRepIdNumber}` : '';

      const result = await updateVendorProfile({
        vendorId: vendorId,
        profileData: {
            ...data,
            identificationNumber: fullId,
            legalRepIdentificationNumber: fullLegalRepId,
        },
      });

      if (result.success) {
        toast({
          title: 'Comercio Actualizado',
          description: 'La información del comercio ha sido guardada.',
        });
        router.push('/admin/vendors');
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al actualizar',
        description: error.message || 'No se pudo guardar la información.',
      });
    } finally {
        setIsSubmitting(false);
    }
  };
  
    const handleGenerateKey = async () => {
        setIsGeneratingKey(true);
        try {
            const result = await generateApiKeyForVendor({ vendorId });
            if (result.success && result.apiKey) {
                setApiKey(result.apiKey);
                toast({
                    title: 'API Key Generada',
                    description: 'La nueva API Key ha sido generada y guardada.',
                });
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al generar la llave',
                description: error.message,
            });
        } finally {
            setIsGeneratingKey(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(apiKey);
        toast({ title: 'Copiado', description: 'La API Key ha sido copiada al portapapeles.' });
    };

  const handleSendTestNotification = async () => {
    if (!vendorId || !vendor) return;
    setIsSendingTest(true);
    toast({
      title: 'Enviando Notificación de Prueba...',
      description: `Intentando enviar a ${vendor.name}.`,
    });
    try {
      const result = await sendPushNotification({
        userId: vendorId,
        collectionName: 'vendors',
        title: 'Notificación de Prueba de HistoPago',
        body: '¡Si recibes esto, las notificaciones push están funcionando correctamente!',
        link: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/dashboard`,
      });

      if (result.success && result.successCount && result.successCount > 0) {
        toast({
          title: 'Prueba Enviada con Éxito',
          description: `Se envió la notificación a ${result.successCount} dispositivo(s).`,
        });
      } else if (result.success) {
         toast({
          variant: 'default',
          title: 'Prueba Enviada, pero sin Destino',
          description: 'El comercio no tiene dispositivos registrados para recibir notificaciones.',
        });
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Enviar Prueba',
        description: error.message,
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleConfirmPendingSales = async () => {
    if (!vendorId) return;
    setIsConfirmingSales(true);
    try {
        const result = await confirmPendingSalesForVendor({ vendorId });
        if (result.success) {
            toast({
                title: 'Operación Exitosa',
                description: result.message,
            });
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error al confirmar ventas',
            description: error.message,
        });
    } finally {
        setIsConfirmingSales(false);
    }
  };

  if (isLoading) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Cargando información del comercio...</p>
        </div>
    )
  }

  if (!vendor) {
    return null; // Or some other placeholder while redirecting
  }

  return (
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
                <FormLabel>RIF o Cédula del Comercio</FormLabel>
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
                        <FormLabel>Correo Electrónico Principal (No editable)</FormLabel>
                        <FormControl>
                        <Input type="email" {...field} readOnly disabled />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Teléfono de Contacto del Comercio</FormLabel>
                        <FormControl>
                            <Input {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <FormField
                    control={form.control}
                    name="creationDate"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Fecha de Registro</FormLabel>
                        <FormControl>
                            <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuración de Gestión</CardTitle>
            <CardDescription>Parámetros personalizados para la cobranza de este comercio.</CardDescription>
          </CardHeader>
          <CardContent>
             <FormField
                control={form.control}
                name="reminderDaysBefore"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Antelación de Recordatorio Amistoso (Días)</FormLabel>
                        <FormControl>
                            <Select onValueChange={field.onChange} value={field.value?.toString()}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar días" />
                                </SelectTrigger>
                                <SelectContent>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(days => (
                                        <SelectItem key={days} value={days.toString()}>{days} día{days > 1 ? 's' : ''} antes</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormControl>
                        <FormDescription>Define con cuánta antelación se enviará el primer aviso preventivo.</FormDescription>
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
                    <FormLabel>Cédula del Rep. Legal</FormLabel>
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
                 <FormField
                    control={form.control}
                    name="legalRepPhone"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl>
                            <Input {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                />
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
                <CardTitle>Acciones Administrativas</CardTitle>
                <CardDescription>
                    Herramientas para corregir estados o realizar acciones masivas en la cuenta de este comercio.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                        <h4 className="font-semibold">Confirmar Ventas Pendientes</h4>
                        <p className="text-sm text-muted-foreground">
                            Activa todas las ventas que están "Pendiente de Confirmación". Útil después de una carga masiva.
                        </p>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button type="button" variant="secondary" disabled={isConfirmingSales}>
                                {isConfirmingSales ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Activar Ventas
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás realmente seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción cambiará el estado de TODAS las ventas con estado "Pendiente de Confirmación" a "Pendiente".
                                    Los clientes ya no podrán confirmar estas ventas manualmente y se considerarán activas.
                                    Esta acción es irreversible.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={handleConfirmPendingSales} disabled={isConfirmingSales}>
                                    {isConfirmingSales && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Sí, confirmar y activar
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
        
        <Card id="api-key">
            <CardHeader>
                <CardTitle>API Key</CardTitle>
                <CardDescription>
                    Usa esta llave secreta para conectar tus sistemas con la API de HistoPago.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input value={apiKey} readOnly placeholder="No se ha generado una API key..." />
                    <Button type="button" variant="outline" size="icon" onClick={copyToClipboard} disabled={!apiKey}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                    Trata esta llave como una contraseña. No la compartas públicamente. Si se ve comprometida, puedes regenerarla.
                </p>
            </CardContent>
            <CardFooter>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive" disabled={isGeneratingKey}>
                            <KeyRound className="mr-2 h-4 w-4" />
                            {apiKey ? 'Regenerar API Key' : 'Generar API Key'}
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {apiKey 
                                    ? 'Al regenerar la API key, la llave anterior dejará de funcionar inmediatamente. Deberás actualizar todos los sistemas que la estén usando con la nueva llave.' 
                                    : 'Esto generará una nueva API key para este comercio.'
                                }
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={handleGenerateKey} disabled={isGeneratingKey}>
                                {isGeneratingKey && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Confirmar y Generar
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardFooter>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle>Herramientas de Desarrollador</CardTitle>
                <CardDescription>
                    Usa estas herramientas para probar funcionalidades específicas directamente.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                        <h4 className="font-semibold">Notificación Push de Prueba</h4>
                        <p className="text-sm text-muted-foreground">
                            Envía una notificación de prueba a los dispositivos asociados con este comercio.
                        </p>
                    </div>
                    <Button type="button" variant="secondary" onClick={handleSendTestNotification} disabled={isSendingTest}>
                        {isSendingTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
                        Enviar Prueba
                    </Button>
                </div>
            </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
             {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar Cambios
          </Button>
        </div>
      </form>
    </Form>
  );
};
