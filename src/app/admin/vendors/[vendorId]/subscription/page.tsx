'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Vendor, SubscriptionManagementSchema, SubscriptionManagementValues } from '@/lib/data';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { updateVendorSubscription } from '@/ai/flows/update-vendor-subscription-flow';
import { format } from 'date-fns';

export default function SubscriptionPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const vendorId = params.vendorId as string;
  const { user } = useUser();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const vendorRef = useMemo(() => {
    if (!firestore || !vendorId) return null;
    return doc(firestore, 'vendors', vendorId);
  }, [firestore, vendorId]);

  const form = useForm<SubscriptionManagementValues>({
    resolver: zodResolver(SubscriptionManagementSchema),
    defaultValues: {
      status: 'Inactivo',
      subscriptionEndDate: '',
      plan: 'HistoGestion',
    },
  });

  const formatDateForInput = (date: any) => {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
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

          const rawPlan = data.plan;
          const normalizedPlan = rawPlan === 'HistoAlquiler' ? 'HistoAlquiler' : 'HistoGestion';

          form.reset({
            status: data.status || 'Activo',
            subscriptionEndDate: data.subscriptionEndDate ? formatDateForInput(data.subscriptionEndDate) : '',
            plan: normalizedPlan,
          });
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
    };
    fetchVendor();
  }, [vendorRef, toast, router, form]);

  const onSubmit = async (data: SubscriptionManagementValues) => {
    if (!vendorId || !user) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo verificar la autenticación.' });
        return;
    };
    setIsSubmitting(true);

    try {
        const result = await updateVendorSubscription({
            vendorId: vendorId,
            status: data.status,
            subscriptionEndDate: data.subscriptionEndDate,
            plan: data.plan,
        });

        if (result.success) {
            toast({
                title: 'Suscripción Actualizada',
                description: 'La información de la suscripción ha sido guardada.',
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

  if (isLoading) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Cargando suscripción...</p>
      </div>
    );
  }

  if (!vendor) {
    return null;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Gestionar Suscripción</CardTitle>
            <CardDescription>
              Ajusta el estado y la fecha de vencimiento para <span className="font-semibold">{vendor.name}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado de la Suscripción</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Activo">Activo</SelectItem>
                          <SelectItem value="Inactivo">Inactivo</SelectItem>
                          <SelectItem value="Suspendido">Suspendido</SelectItem>
                        </SelectContent>
                      </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="plan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan del Comercio</FormLabel>
                   <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un plan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="HistoGestion">HistoGestion</SelectItem>
                          <SelectItem value="HistoAlquiler">HistoAlquiler</SelectItem>
                        </SelectContent>
                      </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subscriptionEndDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha de Fin de Suscripción</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
}
