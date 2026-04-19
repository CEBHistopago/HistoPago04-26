'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, PauseCircle, Check, X, RefreshCw, AlertTriangle, ShieldAlert, Database, Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import { getSuspensionRequests, resolveSuspensionRequest } from '@/ai/flows/vendor-sales-flow';
import type { CreditSale } from '@/lib/data';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export default function AdminSuspensionsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<CreditSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'index' | 'permission' | 'other' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchRequests = useCallback(async (isManual = false) => {
    setIsLoading(true);
    setErrorType(null);
    setErrorMessage(null);
    try {
      const sales = await getSuspensionRequests();
      setRequests(sales as CreditSale[]);
      if (isManual) {
        toast({ title: 'Lista actualizada' });
      }
    } catch (err: any) {
      console.error("Error fetching requests:", err);
      const msg = err.message || '';
      
      if (msg.includes('FAILED_PRECONDITION') || msg.includes('index')) {
          setErrorType('index');
          setErrorMessage("El motor de búsqueda global está siendo configurado en Firebase.");
      } else if (msg.includes('permission-denied') || msg.includes('permisos')) {
          setErrorType('permission');
          setErrorMessage("No tienes permisos suficientes para realizar esta consulta global.");
      } else {
          setErrorType('other');
          setErrorMessage(msg || "No se pudieron cargar las solicitudes en este momento.");
      }

      toast({
        variant: 'destructive',
        title: 'Error de Carga',
        description: msg || 'Ocurrió un problema al obtener las solicitudes.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleResolve = async (sale: CreditSale, action: 'approve' | 'reject') => {
    if (!sale.createdBy) return;
    setIsProcessing(sale.id);
    try {
      const result = await resolveSuspensionRequest({
        vendorId: sale.createdBy,
        saleId: sale.id,
        action: action,
      });

      if (result.success) {
        toast({
          title: action === 'approve' ? 'Solicitud Autorizada' : 'Solicitud Rechazada',
          description: result.message,
        });
        fetchRequests();
      } else {
        throw new Error(result.message);
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error al Procesar',
        description: err.message || 'Ocurrió un error inesperado.',
      });
    } finally {
      setIsProcessing(null);
    }
  };

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
        const d = typeof date === 'string' ? parseISO(date) : (date.toDate ? date.toDate() : new Date(date));
        return format(d, 'dd/MM/yyyy HH:mm');
    } catch (e) { return 'N/A'; }
  };

  if (isLoading && requests.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium text-muted-foreground">Buscando solicitudes pendientes...</p>
      </div>
    );
  }

  if (errorType) {
    return (
        <div className="flex flex-col gap-6">
            <Card className={cn("border-2", errorType === 'index' ? "border-amber-500 bg-amber-50" : "border-destructive bg-destructive/5")}>
                <CardHeader>
                    <div className={cn("flex items-center gap-2", errorType === 'index' ? "text-amber-700" : "text-destructive")}>
                        {errorType === 'index' ? <Database className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
                        <CardTitle>{errorType === 'index' ? 'Configurando Buscador' : 'Error de Acceso'}</CardTitle>
                    </div>
                    <CardDescription className={cn(errorType === 'index' ? "text-amber-800/80" : "text-destructive/80")}>
                        {errorMessage}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm">
                        {errorType === 'index' 
                            ? "Firebase está construyendo el índice necesario para buscar en todos los comercios simultáneamente. Si ya hiciste clic en el enlace de la consola, por favor espera 2-3 minutos y reintenta."
                            : "Este error suele ocurrir si no se han configurado correctamente los permisos del servidor."
                        }
                    </p>
                </CardContent>
                <CardFooter>
                    <Button onClick={() => fetchRequests(true)} variant={errorType === 'index' ? "secondary" : "default"}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reintentar Carga
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Bajas y Suspensiones de Crédito</CardTitle>
            <CardDescription>
              Autoriza o rechaza las eliminaciones definitivas o cierres administrativos solicitados por los comercios.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchRequests(true)} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} /> 
            Actualizar
          </Button>
        </CardHeader>
        <CardContent>
          {requests.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha Solicitud</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Comercio</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{formatDate(sale.suspensionRequestDate)}</TableCell>
                      <TableCell>
                        {sale.status === 'Solicitud de Eliminacion' ? (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                <Trash2 className="h-3 w-3 mr-1" /> Eliminación
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                <PauseCircle className="h-3 w-3 mr-1" /> Suspensión
                            </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{sale.vendorName}</TableCell>
                      <TableCell>{sale.customerName}</TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-xs italic text-muted-foreground truncate" title={sale.suspensionReason}>
                            "{sale.suspensionReason}"
                        </p>
                      </TableCell>
                      <TableCell className="font-bold text-primary">${sale.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="sm" disabled={isProcessing === sale.id}>
                                    <Check className="h-4 w-4 mr-1" /> Autorizar
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Autorizar {sale.status === 'Solicitud de Eliminacion' ? 'Eliminación' : 'Suspensión'}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {sale.status === 'Solicitud de Eliminacion' 
                                            ? "Este registro se BORRARÁ permanentemente de la base de datos junto con sus pagos. Solo usa esto para corregir errores."
                                            : `Esto cerrará el crédito de ${sale.customerName} administrativamente. El saldo quedará congelado pero el registro permanecerá.`
                                        }
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleResolve(sale, 'approve')}>Confirmar Acción</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" disabled={isProcessing === sale.id}>
                                    <X className="h-4 w-4 mr-1" /> Rechazar
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Rechazar Solicitud?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        La venta volverá a su estado original y los cobros automáticos se reanudarán normalmente.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Volver</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleResolve(sale, 'reject')} className="bg-red-600 text-white">Rechazar Solicitud</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
              <PauseCircle className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
              <p className="mt-4 text-lg font-medium text-muted-foreground">Sin solicitudes pendientes</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Los comercios no han solicitado cambios en sus créditos recientemente.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
