'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Vendor,
  SubscriptionPayment,
  CreateSubscriptionPaymentSchema,
  CreateSubscriptionPaymentValues,
} from '@/lib/data';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Loader2, DollarSign } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { createSubscriptionPayment, getPaymentsForVendor } from '@/ai/flows/create-subscription-payment-flow';


function AddPaymentDialog({ vendor, onPaymentAdded }: { vendor: Vendor; onPaymentAdded: () => void }) {
    const [open, setOpen] = useState(false);
    const { toast } = useToast();
    const [isPending, setIsPending] = useState(false);

    const form = useForm<CreateSubscriptionPaymentValues>({
        resolver: zodResolver(CreateSubscriptionPaymentSchema),
        defaultValues: {
            paymentDate: new Date().toISOString().split('T')[0],
            amount: 0,
            monthsPaid: 1,
            paymentMethod: 'Transferencia',
            referenceNumber: '',
        },
    });

    const onSubmit = async (data: CreateSubscriptionPaymentValues) => {
        if (!vendor) return;

        setIsPending(true);
        try {
            const result = await createSubscriptionPayment({
                vendorId: vendor.id,
                ...data,
            });
            
            if (result.success) {
                toast({
                    title: 'Pago Registrado',
                    description: `El pago para ${vendor.name} ha sido guardado.`,
                });
                onPaymentAdded(); // Callback to refresh data
                form.reset();
                setOpen(false);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Registrar Pago',
                description: error.message || 'No se pudo guardar el pago.',
            });
        } finally {
            setIsPending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Registrar Nuevo Pago
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Registrar Nuevo Pago</DialogTitle>
                    <DialogDescription>
                        Registra un pago de suscripción para {vendor.name}.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} id="payment-form" className="space-y-4">
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
                                        <FormLabel>Monto</FormLabel>
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
                                                <SelectValue placeholder="Seleccione un método" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Transferencia">Transferencia</SelectItem>
                                            <SelectItem value="Efectivo">Efectivo</SelectItem>
                                            <SelectItem value="Otro">Otro</SelectItem>
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
                                    <FormLabel>Número de Referencia (Opcional)</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                 <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary" disabled={isPending}>Cancelar</Button>
                    </DialogClose>
                    <Button type="submit" form="payment-form" disabled={isPending}>
                        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Pago
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export default function VendorPaymentsPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const vendorId = params.vendorId as string;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const vendorRef = useMemoFirebase(() => {
    if (!firestore || !vendorId) return null;
    return doc(firestore, 'vendors', vendorId);
  }, [firestore, vendorId]);
  
  const fetchPayments = async () => {
    if (!vendorId) return;
    setPaymentsLoading(true);
    try {
      const paymentList = await getPaymentsForVendor(vendorId);
      setPayments(paymentList);
    } catch (error) {
      console.error("Error fetching payments:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar el historial de pagos.' });
    } finally {
      setPaymentsLoading(false);
    }
  };
  
  useEffect(() => {
    if (!vendorRef) return;

    const unsubscribe = onSnapshot(vendorRef, (docSnap) => {
        if (docSnap.exists()) {
            setVendor({ id: docSnap.id, ...docSnap.data() } as Vendor);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: 'Comercio no encontrado.' });
            router.push('/admin/vendors');
        }
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching vendor:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la información del comercio.' });
        setIsLoading(false);
    });

    fetchPayments();

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorRef, toast, router]);
  
  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    const d = new Date(date); // Timestamps from flow are already ISO strings
    const offset = d.getTimezoneOffset() * 60000;
    const localDate = new Date(d.getTime() + offset);
    return format(localDate, 'dd/MM/yyyy');
  };

  const finalIsLoading = isLoading || paymentsLoading;

  if (finalIsLoading) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Cargando pagos del comercio...</p>
      </div>
    );
  }

  if (!vendor) {
    return null; // Or some other placeholder while redirecting
  }

  return (
    <div className="space-y-8">
        <Card>
            <CardHeader>
                <CardTitle>Pagos de Suscripción: {vendor.name}</CardTitle>
                <CardDescription>
                Aquí puedes registrar nuevos pagos y ver el historial de suscripciones del comercio.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <AddPaymentDialog vendor={vendor} onPaymentAdded={fetchPayments} />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Historial de Pagos</CardTitle>
            </CardHeader>
            <CardContent>
                {payments && payments.length > 0 ? (
                     <div className="border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha de Pago</TableHead>
                                    <TableHead>Monto</TableHead>
                                    <TableHead>Meses Pagados</TableHead>
                                    <TableHead>Método</TableHead>
                                    <TableHead>Referencia</TableHead>
                                    <TableHead>Nueva Expiración</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.map((payment) => (
                                    <TableRow key={payment.id}>
                                        <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                                        <TableCell>${payment.amount.toFixed(2)}</TableCell>
                                        <TableCell>{payment.monthsPaid}</TableCell>
                                        <TableCell>{payment.paymentMethod}</TableCell>
                                        <TableCell>{payment.referenceNumber}</TableCell>
                                        <TableCell>{formatDate(payment.newExpiryDate)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="flex h-48 flex-col items-center justify-center rounded-lg border-2 border-dashed">
                        <p className="text-muted-foreground">No hay pagos registrados para este comercio.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
