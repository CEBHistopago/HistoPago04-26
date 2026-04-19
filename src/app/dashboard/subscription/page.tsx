'use client';

import { useState } from 'react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, Gift, BarChart, FileText } from 'lucide-react';
import type { Vendor } from '@/lib/data';
import { format, parseISO } from 'date-fns';
import { reportSubscriptionPayment } from '@/ai/flows/report-subscription-payment-flow';

const ReportPaymentSchema = z.object({
  paymentDate: z.string().min(1, 'La fecha es obligatoria.'),
  amount: z.coerce.number().positive('El monto debe ser positivo.'),
  monthsPaid: z.coerce.number().int().min(1, 'Debe ser al menos 1 mes.'),
  paymentMethod: z.enum(['Transferencia', 'Pago Movil', 'Zelle', 'Efectivo']),
  referenceNumber: z.string().optional(),
});

type ReportPaymentValues = z.infer<typeof ReportPaymentSchema>;

function ReportPaymentDialog() {
    const { user } = useUser();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<ReportPaymentValues>({
        resolver: zodResolver(ReportPaymentSchema),
        defaultValues: {
            paymentDate: new Date().toISOString().split('T')[0],
            amount: 7.00,
            monthsPaid: 1,
            paymentMethod: 'Transferencia',
            referenceNumber: '',
        },
    });

    const onSubmit = async (data: ReportPaymentValues) => {
        if (!user) return;
        setIsSubmitting(true);
        try {
            const result = await reportSubscriptionPayment({
                vendorId: user.uid,
                ...data,
            });

            if (result.success) {
                toast({
                    title: 'Pago Reportado',
                    description: 'Tu pago ha sido enviado para verificación. Tu plan se actualizará pronto.',
                });
                form.reset();
                setOpen(false);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
             toast({
                variant: 'destructive',
                title: 'Error al Reportar Pago',
                description: error.message,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>Reportar Pago de Suscripción</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reportar Pago de Suscripción</DialogTitle>
                    <DialogDescription>
                        Completa los detalles de tu pago para que nuestro equipo pueda verificarlo.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="report-payment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="paymentDate"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Fecha de Pago</FormLabel>
                                <FormControl>
                                    <Input type="date" {...field} />
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                             <FormField
                                control={form.control}
                                name="amount"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Monto Pagado</FormLabel>
                                    <FormControl>
                                        <Input type="number" step="0.01" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="monthsPaid"
                                render={({ field }) => (
                                    <FormItem>
                                    <FormLabel>Meses Pagados</FormLabel>
                                    <FormControl>
                                        <Input type="number" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                        <FormField
                            control={form.control}
                            name="paymentMethod"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Método de Pago</FormLabel>
                                 <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar método" />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="Transferencia">Transferencia</SelectItem>
                                        <SelectItem value="Pago Movil">Pago Movil</SelectItem>
                                        <SelectItem value="Zelle">Zelle</SelectItem>
                                        <SelectItem value="Efectivo">Efectivo</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="referenceNumber"
                            render={({ field }) => (
                                <FormItem>
                                <FormLabel>Número de Referencia</FormLabel>
                                <FormControl>
                                    <Input {...field} placeholder="Opcional"/>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                 <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline" disabled={isSubmitting}>Cancelar</Button>
                    </DialogClose>
                    <Button type="submit" form="report-payment-form" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Enviar Reporte
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

const pricingDetails = [
    {
        title: 'Tarifa Base Mensual',
        icon: BarChart,
        price: '$7.00',
        description: 'Una tarifa fija para mantener tu cuenta y acceder a todas las funcionalidades base.',
    },
    {
        title: 'Costo por Crédito Activo',
        icon: FileText,
        price: '$0.33',
        description: 'Un pequeño cargo por cada crédito o contrato que gestionaste durante el mes.',
    },
    {
        title: 'Bono de Primer Mes',
        icon: Gift,
        price: '5 Créditos Gratis',
        description: 'Para ayudarte a empezar, los primeros 5 créditos que registres en tu primer mes corren por nuestra cuenta.',
    },
];

export default function SubscriptionPage() {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();

  const vendorRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'vendors', user.uid);
  }, [user, firestore]);

  const { data: vendorData, isLoading: vendorLoading } = useDoc<Vendor>(vendorRef);
  
  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    // Timestamps from Firestore need to be converted to Date objects
    const d = date.toDate ? date.toDate() : parseISO(date);
    return format(d, 'dd/MM/yyyy');
  };
  
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'Activo':
        return <Badge className="bg-green-100 text-green-800">Activo</Badge>;
      case 'Inactivo':
        return <Badge className="bg-yellow-100 text-yellow-800">Inactivo</Badge>;
      case 'Suspendido':
        return <Badge variant="destructive">Suspendido</Badge>;
      default:
        return <Badge variant="secondary">Desconocido</Badge>;
    }
  };

  const isLoading = userLoading || vendorLoading;

  if (isLoading) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Cargando información de tu suscripción...</p>
      </div>
    );
  }

  const currentPlanName = vendorData?.plan === 'HistoAlquiler' ? 'HistoAlquiler' : 'HistoGestion';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Gestión de Suscripción</h1>
        <p className="text-muted-foreground">Consulta tu plan actual y reporta tus pagos.</p>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Resumen de tu Suscripción</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-6 text-center md:text-left">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Estado</p>
            <p className="text-lg font-semibold">{getStatusBadge(vendorData?.status)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Plan Actual</p>
            <p className="text-lg font-semibold">{currentPlanName}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Suscripción Vence</p>
            <p className="text-lg font-semibold">{formatDate(vendorData?.subscriptionEndDate)}</p>
          </div>
        </CardContent>
        <CardFooter>
            <ReportPaymentDialog />
        </CardFooter>
      </Card>
      
      <div>
        <h2 className="text-xl font-bold mb-2">Nuestro Modelo de Precios Simplificado</h2>
        <p className="text-muted-foreground mb-4">Un plan único, transparente y justo que escala con tu negocio.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingDetails.map(detail => (
                 <Card key={detail.title}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-base font-medium">{detail.title}</CardTitle>
                        <detail.icon className="h-5 w-5 text-muted-foreground"/>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{detail.price}</p>
                        <p className="text-xs text-muted-foreground">{detail.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
      </div>
    </div>
  );
}
