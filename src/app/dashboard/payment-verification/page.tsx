'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck, Check, Search } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { getPendingPaymentsForVendor } from '@/ai/flows/pending-payments-flow';
import {
  rejectPaymentByVendor,
  verifyPaymentByVendor,
} from '@/ai/flows/vendor-sales-flow';
import type { GetPendingPaymentsOutput } from '@/ai/flows/pending-payments-flow';
import { doc } from 'firebase/firestore';
import type { Vendor } from '@/lib/data';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function RejectPaymentDialog({
  paymentId,
  saleId,
  onAction,
}: {
  paymentId: string;
  saleId: string;
  onAction: () => void;
}) {
  const { user } = useUser();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const handleReject = async () => {
    if (!user) return;
    if (!reason) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes indicar un motivo para el rechazo.',
      });
      return;
    }

    setIsPending(true);
    try {
      const result = await rejectPaymentByVendor({
        vendorId: user.uid,
        saleId: saleId,
        paymentId: paymentId,
        reason,
      });

      if (result.success) {
        toast({ title: 'Pago Rechazado' });
        onAction();
        setOpen(false);
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al rechazar',
        description: error.message,
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-600 hover:bg-red-50"
        >
          Rechazar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Rechazar Pago</AlertDialogTitle>
          <AlertDialogDescription>
            Por favor, indica el motivo por el cual se rechaza este pago.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <Label htmlFor="reason">Motivo del Rechazo</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: El pago no se refleja en la cuenta bancaria."
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleReject} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Rechazo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function PaymentVerificationPage() {
  const { user, loading: userLoading } = useUser();
  const { toast } = useToast();
  const firestore = useFirestore();

  const [payments, setPayments] = useState<GetPendingPaymentsOutput>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchPayments = async () => {
    if (!user) {
        setIsLoading(false);
        return;
    };
    setIsLoading(true);
    try {
      const result = await getPendingPaymentsForVendor(user.uid);
      setPayments(result);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Cargar Pagos',
        description:
          error.message || 'No se pudieron obtener los pagos pendientes.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!userLoading) {
      fetchPayments();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userLoading]);

  const handleVerify = async (payment: (typeof payments)[0]) => {
    if (!user) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la información del comercio.' });
        return;
    };
    setVerifyingId(payment.id);

    try {
      const result = await verifyPaymentByVendor({
        vendorId: user.uid,
        saleId: payment.creditSaleId,
        paymentId: payment.id,
      });

      if (result.success) {
        toast({
          title: 'Pago Verificado',
          description: result.message,
        });
        fetchPayments(); // Refresh the list
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al verificar',
        description: error.message,
      });
    } finally {
      setVerifyingId(null);
    }
  };

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    return format(d, 'dd/MM/yyyy HH:mm');
  };

  const filteredPayments = payments.filter(
    (p) =>
      p.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.referenceNumber && p.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">
          Cargando pagos por verificar...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Verificación de Pagos de Clientes</CardTitle>
            <CardDescription>
              Aquí puedes ver y gestionar todos los pagos reportados por tus
              clientes.
            </CardDescription>
          </div>
           <div className="relative mt-4 md:mt-0 w-full md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar cliente, documento, ref..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </CardHeader>
        <CardContent>
          {filteredPayments.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha Reporte</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">
                        {payment.customerName}
                      </TableCell>
                      <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell>${payment.amount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button asChild variant="link" className="p-0 h-auto">
                            <Link href={`/dashboard/sales#${payment.creditSaleId}`}>
                                {payment.invoiceNumber}
                            </Link>
                        </Button>
                      </TableCell>
                      <TableCell>{payment.referenceNumber}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          onClick={() => handleVerify(payment)}
                          disabled={verifyingId === payment.id}
                        >
                          {verifyingId === payment.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-2 h-4 w-4" />
                          )}
                          Verificar
                        </Button>
                        <RejectPaymentDialog
                          paymentId={payment.id}
                          saleId={payment.creditSaleId}
                          onAction={fetchPayments}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
              <ShieldCheck className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Todo en Orden</p>
              <p className="mt-2 text-sm text-muted-foreground">
                No hay pagos pendientes de verificación en este momento.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
