'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, FileText } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getInvoicesForVendor } from '@/ai/flows/get-invoices-flow';
import type { Invoice } from '@/lib/data';
import { format } from 'date-fns';

export default function VendorInvoicesPage() {
  const { toast } = useToast();
  const params = useParams();
  const vendorId = params.vendorId as string;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!vendorId) return;

    const fetchInvoices = async () => {
      setIsLoading(true);
      try {
        const result = await getInvoicesForVendor(vendorId);
        setInvoices(result);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error al Cargar Facturas',
          description: error.message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoices();
  }, [vendorId, toast]);

  const formatDate = (dateString: string, fmt = 'dd/MM/yyyy') => {
    return format(new Date(dateString), fmt);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Cargando facturación...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Historial de Facturación</CardTitle>
          <CardDescription>
            Facturas generadas mensualmente para este comercio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Factura</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell>{`${formatDate(invoice.periodStart, 'MMM yyyy')}`}</TableCell>
                    <TableCell className="font-semibold">${invoice.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'Pagado' ? 'default' : 'secondary'}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex h-48 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">Sin Facturas</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Aún no se han generado facturas para este comercio.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
