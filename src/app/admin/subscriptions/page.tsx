'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check, ShieldCheck, FileText } from 'lucide-react';
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
import { getPendingSubscriptionPayments } from '@/ai/flows/report-subscription-payment-flow';
import { createSubscriptionPayment } from '@/ai/flows/create-subscription-payment-flow';
import type { SubscriptionPaymentReport } from '@/lib/data';
import { format } from 'date-fns';

function ConfirmPaymentDialog({ report, onConfirmed }: { report: SubscriptionPaymentReport, onConfirmed: () => void }) {
    const { toast } = useToast();
    const [isConfirming, setIsConfirming] = useState(false);

    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            const result = await createSubscriptionPayment({
                vendorId: report.vendorId,
                paymentDate: report.paymentDate,
                amount: report.amount,
                monthsPaid: report.monthsPaid,
                paymentMethod: report.paymentMethod,
                referenceNumber: report.referenceNumber,
            });

            if (result.success) {
                toast({
                    title: 'Pago Confirmado',
                    description: `La suscripción de ${report.vendorName} ha sido actualizada.`,
                });
                onConfirmed();
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Confirmar',
                description: error.message,
            });
        } finally {
            setIsConfirming(false);
        }
    };
    
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                 <Button size="sm" disabled={isConfirming}>
                    <Check className="mr-2 h-4 w-4" />
                    Verificar y Aplicar
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Pago de Suscripción</AlertDialogTitle>
                    <AlertDialogDescription>
                        Estás a punto de verificar y aplicar un pago de suscripción. Esta acción actualizará la fecha de vencimiento del comercio.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="text-sm space-y-2">
                    <p><strong>Comercio:</strong> {report.vendorName}</p>
                    <p><strong>Fecha de Pago:</strong> {format(new Date(report.paymentDate), 'dd/MM/yyyy')}</p>
                    <p><strong>Monto:</strong> ${report.amount.toFixed(2)}</p>
                    <p><strong>Meses Pagados:</strong> {report.monthsPaid}</p>
                    <p><strong>Método:</strong> {report.paymentMethod}</p>
                    {report.referenceNumber && <p><strong>Referencia:</strong> {report.referenceNumber}</p>}
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isConfirming}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirm} disabled={isConfirming}>
                        {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Confirmar y Actualizar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export default function AdminSubscriptionsPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<SubscriptionPaymentReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const result = await getPendingSubscriptionPayments();
      setReports(result);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Cargar Reportes',
        description: error.message || 'No se pudieron obtener los reportes de pago pendientes.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm');
  };

  if (isLoading) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Cargando pagos de suscripción pendientes...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Pagos de Suscripción por Verificar</CardTitle>
          <CardDescription>
            Aquí puedes ver y gestionar los pagos de suscripción reportados por los comercios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reports.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comercio</TableHead>
                    <TableHead>Fecha Reporte</TableHead>
                    <TableHead>Fecha Pago</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Meses</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">{report.vendorName}</TableCell>
                      <TableCell>{formatDate(report.reportDate)}</TableCell>
                      <TableCell>{formatDate(report.paymentDate)}</TableCell>
                      <TableCell>${report.amount.toFixed(2)}</TableCell>
                      <TableCell>{report.monthsPaid}</TableCell>
                      <TableCell>{report.paymentMethod}</TableCell>
                      <TableCell>{report.referenceNumber || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <ConfirmPaymentDialog report={report} onConfirmed={fetchReports} />
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
                No hay pagos de suscripción pendientes de verificación en este momento.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
