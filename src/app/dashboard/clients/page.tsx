'use client';

import { useMemo, useState, useEffect } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { Loader2, Users, Search, ArrowUpDown, Coins } from 'lucide-react';
import { ClientSummary, GetCustomerHistoryOutput, CreditSale, Payment, Vendor } from '@/lib/data';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { summarizeClients } from '@/ai/flows/summarize-clients-flow';
import { getCustomerHistory } from '@/ai/flows/customer-history-flow';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { PaymentDialog } from '@/components/payment-dialog';
import { doc, getDoc } from 'firebase/firestore';


type SortKey = keyof ClientSummary;
type SortDirection = 'asc' | 'desc';

function ClientDetailDialog({ client, user, children, isRentalPlan }: { client: ClientSummary, user: any, children: React.ReactNode, isRentalPlan: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GetCustomerHistoryOutput | null>(null);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const historyData = await getCustomerHistory({ 
        customerIdentification: client.id, 
        vendorId: user.uid 
      });
      setHistory(historyData);
    } catch (err: any) {
      setError(err.message || 'No se pudo cargar el historial del cliente.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      fetchHistory(); // Fetch data when dialog opens
    }
  };

  // Re-fetch when the trigger is updated, but only if the dialog is open.
  useEffect(() => {
    if (open) {
      fetchHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateTrigger]);

  const handlePaymentAction = () => {
    setUpdateTrigger(c => c + 1); // Increment trigger to cause re-fetch
  };

  const formatDate = (date: any, includeTime = false) => {
    if (!date) return 'N/A';
    try {
        const d = parseISO(date);
        return format(d, includeTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
    } catch (error) {
        return 'Fecha inválida';
    }
  };


  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isRentalPlan ? 'Resumen de Inquilino' : 'Resumen de Cliente'}: {client.name}</DialogTitle>
          <DialogDescription>ID: {client.id}</DialogDescription>
        </DialogHeader>
        <div className="flex-grow overflow-y-auto -mx-6 px-6 py-4">
            {loading ? (
                <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="ml-2">Cargando historial...</p>
                </div>
            ) : error ? (
                <p className="text-red-500">{error}</p>
            ) : history ? (
                <div className="space-y-4">
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{isRentalPlan ? 'Monto Total en Contratos' : 'Monto Total en Créditos'}</CardTitle></CardHeader>
                            <CardContent><p className="text-2xl font-bold">${history.stats.totalAmount.toFixed(2)}</p></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Pagado</CardTitle></CardHeader>
                            <CardContent><p className="text-2xl font-bold text-green-600">${history.stats.totalPaid.toFixed(2)}</p></CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Deuda Total Pendiente</CardTitle></CardHeader>
                            <CardContent><p className="text-2xl font-bold text-red-600">${history.stats.totalDebt.toFixed(2)}</p></CardContent>
                        </Card>
                    </div>
                    
                    <h4 className="font-semibold pt-4">{isRentalPlan ? 'Historial de Contratos' : 'Historial de Créditos'} con tu Comercio</h4>
                    <div className="border rounded-lg">
                      <div className="relative w-full overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{isRentalPlan ? 'Contrato/Recibo' : 'Documento'}</TableHead>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Monto</TableHead>
                                    <TableHead>Saldo</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acción</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.history.map((sale: CreditSale) => (
                                    <TableRow key={sale.id}>
                                        <TableCell>{sale.invoiceNumber}</TableCell>
                                        <TableCell>{formatDate(sale.saleDate)}</TableCell>
                                        <TableCell>${sale.amount.toFixed(2)}</TableCell>
                                        <TableCell className="font-bold text-red-600">${(sale.remainingBalance || 0).toFixed(2)}</TableCell>
                                        <TableCell><Badge variant={sale.status === 'Pagado' ? 'default' : sale.status === 'Vencido' ? 'destructive' : 'secondary'}>{sale.status}</Badge></TableCell>
                                        <TableCell className="text-right">
                                          {sale.status !== 'Pagado' && (
                                            <PaymentDialog
                                                actorRole="vendor"
                                                sale={sale}
                                                pendingBalance={sale.remainingBalance || 0}
                                                onPaymentReported={handlePaymentAction}
                                            >
                                              <Button size="sm" variant="outline">
                                                <Coins className="mr-2 h-4 w-4" />
                                                Añadir Pago
                                              </Button>
                                            </PaymentDialog>
                                          )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                      </div>
                    </div>
                </div>
            ) : (
              <p>No se encontró historial para este cliente.</p>
            )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ClientsPage() {
    const { user, loading: userLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [clientsData, setClientsData] = useState<ClientSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [vendorData, setVendorData] = useState<Vendor | null>(null);

    useEffect(() => {
        const processClientData = async () => {
            // Wait until user is fully loaded and authenticated
            if (userLoading || !user || !firestore) {
                if (!userLoading) {
                    setIsLoading(false);
                }
                return;
            }
            
            setIsLoading(true);

            try {
                // Fetch vendor data first to know the plan
                const vendorRef = doc(firestore, 'vendors', user.uid);
                const vendorSnap = await getDoc(vendorRef);
                if (vendorSnap.exists()) {
                    setVendorData(vendorSnap.data() as Vendor);
                }

                const summary = await summarizeClients(user.uid);
                setClientsData(summary);
            } catch (error: any) {
                console.error('Error summarizing clients:', error);
                toast({
                    variant: 'destructive',
                    title: 'Error al cargar clientes',
                    description: 'No se pudo obtener el resumen de clientes desde el servidor.',
                });
                setClientsData([]);
            } finally {
                setIsLoading(false);
            }
        };

        processClientData();

    }, [user, userLoading, toast, firestore]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const sortedAndFilteredClients = useMemo(() => {
        let result = [...clientsData];

        if (searchTerm) {
            result = result.filter(client =>
                client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                client.id.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        result.sort((a, b) => {
            const valA = a[sortKey];
            const valB = b[sortKey];

            let comparison = 0;
            if (typeof valA === 'string' && typeof valB === 'string') {
                comparison = valA.localeCompare(valB);
            } else if (typeof valA === 'number' && typeof valB === 'number') {
                comparison = valA - valB;
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [clientsData, searchTerm, sortKey, sortDirection]);

    const finalIsLoading = userLoading || isLoading;
    const isRentalPlan = vendorData?.plan === 'HistoAlquiler';

    const renderSortIcon = (key: SortKey) => {
        if (sortKey !== key) {
            return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />;
        }
        return sortDirection === 'asc' ? '▲' : '▼';
    };

    if (finalIsLoading) {
        return (
            <div className="flex h-96 w-full flex-col items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Cargando y procesando clientes...</p>
            </div>
        );
    }
    
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="w-full sm:w-auto">
                    <h1 className="text-2xl font-bold">{isRentalPlan ? 'Todos los Inquilinos' : 'Todos los Clientes'}</h1>
                    <p className="text-muted-foreground">
                        {isRentalPlan ? 'Listado de todos tus inquilinos con contratos activos.' : 'Listado de todos tus clientes con créditos activos.'}
                    </p>
                </div>
                 <div className="relative w-full sm:w-64">
                   <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Buscar por nombre o ID..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {sortedAndFilteredClients.length > 0 ? (
                <div className="border rounded-lg w-full">
                    <div className="relative w-full overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        <Button variant="ghost" onClick={() => handleSort('name')}>
                                            Nombre {renderSortIcon('name')}
                                        </Button>
                                    </TableHead>
                                    <TableHead>
                                        <Button variant="ghost" onClick={() => handleSort('id')}>
                                            Identificación {renderSortIcon('id')}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-center">
                                        <Button variant="ghost" onClick={() => handleSort('status')}>
                                            Estado {renderSortIcon('status')}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-center">
                                        <Button variant="ghost" onClick={() => handleSort('activeCredits')}>
                                            {isRentalPlan ? 'Contratos Activos' : 'Créditos Activos'} {renderSortIcon('activeCredits')}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-right">
                                        <Button variant="ghost" onClick={() => handleSort('totalCreditAmount')}>
                                            {isRentalPlan ? 'Monto Total Contratos' : 'Monto Total Crédito'} {renderSortIcon('totalCreditAmount')}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-right">
                                        <Button variant="ghost" onClick={() => handleSort('totalPaid')}>
                                            Total Pagado {renderSortIcon('totalPaid')}
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-right font-semibold">
                                         <Button variant="ghost" onClick={() => handleSort('pendingBalance')}>
                                            Saldo Pendiente {renderSortIcon('pendingBalance')}
                                        </Button>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedAndFilteredClients.map(client => (
                                    <ClientDetailDialog key={client.id} client={client} user={user} isRentalPlan={isRentalPlan}>
                                        <TableRow className="cursor-pointer">
                                            <TableCell className="font-medium">{client.name}</TableCell>
                                            <TableCell>{client.id}</TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant={client.status === 'Vencido' ? 'destructive' : 'default'} className={client.status === 'Al Día' ? 'bg-green-100 text-green-800' : ''}>
                                                    {client.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{client.activeCredits}</TableCell>
                                            <TableCell className="text-right">${client.totalCreditAmount.toFixed(2)}</TableCell>
                                            <TableCell className="text-right text-green-600">${client.totalPaid.toFixed(2)}</TableCell>
                                            <TableCell className="text-right font-semibold text-red-600">${client.pendingBalance.toFixed(2)}</TableCell>
                                        </TableRow>
                                    </ClientDetailDialog>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            ) : (
                 <div className="flex h-96 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <div className="text-center">
                         <Users className="mx-auto h-12 w-12 text-muted-foreground" />
                        <p className="mt-4 text-lg font-medium">
                           {searchTerm ? 'No se encontraron clientes' : 'No tienes clientes con créditos activos'}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                           {searchTerm 
                             ? 'Prueba con otro término de búsqueda.'
                             : 'Cuando registres una venta a crédito, tus clientes aparecerán aquí.'
                           }
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
