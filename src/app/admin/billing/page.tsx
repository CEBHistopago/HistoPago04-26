'use client';

import { useState, useEffect, useMemo } from 'react';
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
  TableFooter,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileDigit, Users, DollarSign, Receipt, TrendingUp, Wand2, PlusCircle, Clock, Calendar } from 'lucide-react';
import { format, addMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { getBillingSummary } from '@/ai/flows/get-billing-summary-flow';
import { generateMonthlyInvoice } from '@/ai/flows/generate-invoice-flow';
import type { BillingSummaryItem } from '@/lib/data';

export default function AdminBillingPage() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<BillingSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter State (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  
  // Manual Invoice State
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);


  const billingPeriodLabel = useMemo(() => {
    try {
        const [year, month] = selectedMonth.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return format(date, "MMMM 'de' yyyy", { locale: es });
    } catch {
        return 'Período seleccionado';
    }
  }, [selectedMonth]);

  const totals = useMemo(() => {
    return summary.reduce(
      (acc, item) => {
        acc.totalNewCredits += item.newCredits;
        acc.totalActiveLegacyCredits += item.activeLegacyCredits;
        acc.totalActiveCredits += item.activeCredits;
        acc.totalBaseFee += item.baseFee;
        acc.totalVariableAmount += item.variableAmount;
        acc.totalBillableAmount += item.billableAmount;
        return acc;
      },
      { totalNewCredits: 0, totalActiveLegacyCredits: 0, totalActiveCredits: 0, totalBaseFee: 0, totalVariableAmount: 0, totalBillableAmount: 0 }
    );
  }, [summary]);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsLoading(true);
      try {
        // El flujo espera una fecha o string de fecha para determinar el mes
        const result = await getBillingSummary({ billingDate: selectedMonth });
        setSummary(result);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Error al Cargar Resumen',
          description: error.message || 'No se pudo obtener el resumen de facturación.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchSummary();
  }, [selectedMonth, toast]);

  const handleManualInvoiceGeneration = async () => {
    if (!selectedVendor || !selectedMonth) {
        toast({
            variant: 'destructive',
            title: 'Datos incompletos',
            description: 'Por favor, selecciona un comercio y un período de facturación.',
        });
        return;
    }
    
    setIsGenerating(true);
    try {
        // El flujo de facturación genera para el mes ANTERIOR a la fecha pasada.
        // Si queremos facturar Julio (seleccionado en el UI), debemos pasar Agosto al flujo.
        const [year, month] = selectedMonth.split('-');
        const dateForFlow = addMonths(new Date(parseInt(year), parseInt(month) - 1, 1), 1);
        
        const result = await generateMonthlyInvoice({
            vendorId: selectedVendor,
            billingDate: dateForFlow.toISOString(),
        });
        
        if (result.success) {
            toast({
                title: 'Factura Generada Exitosamente',
                description: result.message,
            });
        } else {
            throw new Error(result.message);
        }
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Error al Generar Factura',
            description: error.message || 'Ocurrió un error inesperado.',
        });
    } finally {
        setIsGenerating(false);
    }
  };


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <CardTitle>Panel de Facturación</CardTitle>
                <CardDescription>Consulta y gestiona los cobros de la plataforma por período.</CardDescription>
            </div>
            <div className="flex items-center gap-3 bg-muted p-2 rounded-lg border">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="global-month-filter" className="sr-only">Seleccionar Mes</Label>
                <Input 
                    id="global-month-filter"
                    type="month" 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-[180px] bg-background"
                />
            </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comercios</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : summary.length}</div>
            <p className="text-xs text-muted-foreground">En {billingPeriodLabel}.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Créditos Nuevos</CardTitle>
            <PlusCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : totals.totalNewCredits}</div>
            <p className="text-xs text-muted-foreground">Creados en el mes.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Créditos Anteriores</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : totals.totalActiveLegacyCredits}</div>
            <p className="text-xs text-muted-foreground">Activos del pasado.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cargos Fijos</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${isLoading ? '...' : totals.totalBaseFee.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Suma de tarifas base.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cargos Variables</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${isLoading ? '...' : totals.totalVariableAmount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Suma por uso.</p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary">Facturación Total</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">${isLoading ? '...' : totals.totalBillableAmount.toFixed(2)}</div>
            <p className="text-xs text-primary/70">Ingreso estimado.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen de Facturación por Comercio - {billingPeriodLabel}</CardTitle>
          <CardDescription>
            Estimación detallada de los cargos para el mes seleccionado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-48 w-full flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground text-sm font-medium">Recalculando para {billingPeriodLabel}...</p>
            </div>
          ) : summary.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Comercio</TableHead>
                    <TableHead className="text-center">Créditos Nuevos</TableHead>
                    <TableHead className="text-center">Créd. Anteriores</TableHead>
                    <TableHead className="text-center">Total Facturados</TableHead>
                    <TableHead className="text-right">Cargo Fijo</TableHead>
                    <TableHead className="text-right">Cargo Variable</TableHead>
                    <TableHead className="text-right">Total a Facturar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((item) => (
                    <TableRow key={item.vendorId}>
                      <TableCell className="font-medium">{item.vendorName}</TableCell>
                      <TableCell className="text-center">{item.newCredits}</TableCell>
                      <TableCell className="text-center">{item.activeLegacyCredits}</TableCell>
                      <TableCell className="text-center font-semibold">{item.activeCredits}</TableCell>
                      <TableCell className="text-right">${item.baseFee.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${item.variableAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">${item.billableAmount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-center font-bold">{totals.totalNewCredits}</TableCell>
                    <TableCell className="text-center font-bold">{totals.totalActiveLegacyCredits}</TableCell>
                    <TableCell className="text-center font-bold">{totals.totalActiveCredits}</TableCell>
                    <TableCell className="text-right font-bold">${totals.totalBaseFee.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">${totals.totalVariableAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">${totals.totalBillableAmount.toFixed(2)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <div className="flex h-48 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
              <FileDigit className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No hay comercios para facturar</p>
              <p className="mt-2 text-sm text-muted-foreground">
                No se encontraron comercios con créditos activos en {billingPeriodLabel}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Generación Manual de Factura</CardTitle>
            <CardDescription>
                Crea una factura para un comercio específico por el período de <strong>{billingPeriodLabel}</strong>.
            </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="grid gap-2 w-full sm:w-auto">
                <Label htmlFor="vendor-select">Comercio</Label>
                 <Select value={selectedVendor} onValueChange={setSelectedVendor} disabled={isGenerating}>
                    <SelectTrigger id="vendor-select" className="w-full sm:w-[300px]">
                        <SelectValue placeholder="Seleccionar un comercio" />
                    </SelectTrigger>
                    <SelectContent>
                        {summary.map(item => (
                             <SelectItem key={item.vendorId} value={item.vendorId}>{item.vendorName}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button onClick={handleManualInvoiceGeneration} disabled={isGenerating || !selectedVendor} className="w-full sm:w-auto">
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                <span className="ml-2">Generar y Enviar Factura</span>
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}
