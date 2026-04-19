'use client';

import { useState, useEffect, useMemo, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/firebase';
import { CreatePaymentSchema, CreatePaymentValues, CreditSale } from '@/lib/data';
import { reportOrConfirmPayment } from '@/ai/flows/vendor-sales-flow';
import { Loader2 } from 'lucide-react';
import { format, startOfDay } from 'date-fns';

interface PaymentDialogProps {
  actorRole: 'vendor' | 'customer';
  sale: CreditSale;
  onPaymentReported: () => void;
  children: ReactNode;
  pendingBalance?: number;
  amortizationSchedule?: any[];
}

export function PaymentDialog({
  actorRole,
  sale,
  onPaymentReported,
  children,
  pendingBalance = 0,
  amortizationSchedule = [],
}: PaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);
  const { user } = useUser();

  const form = useForm<CreatePaymentValues>({
    resolver: zodResolver(CreatePaymentSchema.refine(
        (data) => data.amount <= pendingBalance + 0.01, {
        message: 'El monto del pago no puede exceder el saldo pendiente.',
        path: ['amount'],
    })),
    defaultValues: {
      amount: 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'Transferencia',
      referenceNumber: '',
      receiptImageUrl: '',
    },
  });

  const { watch, reset, trigger } = form;
  const paymentMethod = watch('paymentMethod');
  const paymentDate = watch('paymentDate');
  
  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const showReferenceField = useMemo(() => {
    return !['Efectivo', 'Punto de Venta'].includes(paymentMethod);
  }, [paymentMethod]);

  const onSubmit = async (data: CreatePaymentValues) => {
    if (!user || !sale) return;

    // --- CLIENT-SIDE DATE CHECK ---
    const saleDateRaw = sale.saleDate;
    const saleDate = startOfDay(saleDateRaw.toDate ? saleDateRaw.toDate() : new Date(saleDateRaw));
    const payDate = startOfDay(new Date(data.paymentDate));

    if (payDate < saleDate) {
        toast({
            variant: 'destructive',
            title: 'Fecha Inválida',
            description: `La fecha del pago no puede ser anterior a la venta (${format(saleDate, 'dd/MM/yyyy')}).`,
        });
        return;
    }

    setIsPending(true);
    try {
      const result = await reportOrConfirmPayment({
        actorId: user.uid,
        actorRole: actorRole,
        vendorId: sale.createdBy,
        saleId: sale.id,
        paymentData: data,
      });

      if (result.success) {
        toast({
          title: actorRole === 'vendor' ? 'Pago Registrado' : 'Pago Reportado',
          description: result.message,
        });
        onPaymentReported();
        setOpen(false);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('Error processing payment:', error);
      toast({
        variant: 'destructive',
        title: 'Error al procesar pago',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actorRole === 'vendor' ? 'Añadir Pago a Venta' : 'Reportar Pago Realizado'}</DialogTitle>
          <DialogDescription>
            {actorRole === 'vendor'
              ? `Registra un nuevo pago para la venta a ${sale.customerName}. Saldo pendiente: $${pendingBalance.toFixed(2)}`
              : `Completa los datos del pago realizado a ${sale.vendorName}.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            id="payment-form"
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Monto del Pago *</FormLabel>
                        <FormControl>
                        <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={e => {
                                const value = e.target.value;
                                const regex = /^\d*\.?\d{0,2}$/;
                                if (regex.test(value)) {
                                    field.onChange(e);
                                }
                            }}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Fecha del Pago *</FormLabel>
                        <FormControl>
                        <Input type="date" {...field} />
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
                  <FormLabel>Forma de Pago *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una forma de pago" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Efectivo">Efectivo</SelectItem>
                      <SelectItem value="Transferencia">Transferencia</SelectItem>
                      <SelectItem value="Pago Movil">Pago Móvil</SelectItem>
                      <SelectItem value="Zelle">Zelle</SelectItem>
                      <SelectItem value="Punto de Venta">Punto de Venta</SelectItem>
                      <SelectItem value="Transferencia Internacional">Transferencia Internacional</SelectItem>
                      <SelectItem value="CriptoActivo">CriptoActivo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showReferenceField && (
                <FormField
                    control={form.control}
                    name="referenceNumber"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Número de Referencia</FormLabel>
                            <FormControl>
                                <Input placeholder="Ej: 00123456" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            )}
             <FormField
                control={form.control}
                name="receiptImageUrl"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>URL del Comprobante (Opcional)</FormLabel>
                        <FormControl>
                            <Input placeholder="https://ejemplo.com/comprobante.jpg" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

          </form>
        </Form>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isPending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" form="payment-form" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {actorRole === 'vendor' ? 'Guardar Pago' : 'Reportar Pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
