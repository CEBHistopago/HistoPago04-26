'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, FileText, Check, Download, Wallet } from 'lucide-react';
import { useUser, useFirestore } from '@/firebase';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableFooter,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getCustomerHistory } from '@/ai/flows/customer-history-flow';
import { confirmSaleByCustomer } from '@/ai/flows/vendor-sales-flow';
import type { GetCustomerHistoryOutput, CreditSaleWithPayments, Customer } from '@/lib/data';
import { cn } from '@/lib/utils';
import { doc, getDoc } from 'firebase/firestore';
import { format, parseISO, addWeeks, addMonths, addQuarters, differenceInDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';
import { PaymentDialog } from '@/components/payment-dialog';


function ConfirmationDialog({ sale, onConfirmed }: { sale: CreditSaleWithPayments; onConfirmed: () => void }) {
    const [open, setOpen] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const { user } = useUser();
    const { toast } = useToast();

    const handleConfirm = async () => {
        if (!user || !sale.createdBy) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'No se pudo verificar la información para confirmar.',
            });
            return;
        };
        setIsConfirming(true);
        try {
            const result = await confirmSaleByCustomer({
                saleId: sale.id,
                vendorId: sale.createdBy,
                customerId: user.uid,
            });
            if (result.success) {
                toast({
                    title: 'Crédito Confirmado',
                    description: 'Has aceptado el nuevo compromiso de crédito.',
                });
                onConfirmed(); // This will trigger a refresh of the history list
                setOpen(false);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Error al Confirmar',
                description: error.message || 'No se pudo confirmar el crédito.',
            });
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="secondary" onClick={(e) => e.stopPropagation()}>Revisar y Confirmar</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirmar Nuevo Compromiso</DialogTitle>
                    <DialogDescription>
                        Revisa los detalles de este nuevo crédito de <span className="font-semibold">{sale.vendorName}</span> y confírmalo.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 text-sm">
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Documento Nro:</span>
                        <span className="font-medium">{sale.invoiceNumber}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Monto Total:</span>
                        <span className="font-medium">${sale.amount.toFixed(2)}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Número de Cuotas:</span>
                        <span className="font-medium">{sale.numberOfInstallments}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-muted-foreground">Monto por Cuota:</span>
                        <span className="font-medium">${(sale.installmentAmount || 0).toFixed(2)} ({sale.paymentFrequency})</span>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="outline" disabled={isConfirming}>
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button onClick={handleConfirm} disabled={isConfirming}>
                        {isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                        Confirmar Compromiso
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function HistoryTable({ history, onSaleAction, customer }: { history: CreditSaleWithPayments[], onSaleAction: () => void, customer: Customer | null }) {
    const [filterStatus, setFilterStatus] = useState('Todos');

    const filteredHistory = useMemo(() => {
        if (filterStatus === 'Todos') {
            return history;
        }
        return history.filter(sale => sale.status === filterStatus);
    }, [history, filterStatus]);

    const totals = useMemo(() => {
        return filteredHistory.reduce((acc, sale) => {
            if (sale.status !== 'Pendiente de Confirmación') {
                acc.totalAmount += sale.amount;
                acc.totalPaid += sale.totalPaid || 0;
                acc.totalPending += sale.remainingBalance || 0;
            }
            return acc;
        }, {
            totalAmount: 0,
            totalPaid: 0,
            totalPending: 0,
        });
    }, [filteredHistory]);

    const statusColors: { [key: string]: string } = {
        'Pagado': 'bg-green-100 text-green-800',
        'Pendiente': 'bg-yellow-100 text-yellow-800',
        'Vencido': 'bg-red-100 text-red-800',
        'Pendiente de Confirmación': 'bg-blue-100 text-blue-800',
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

    const downloadFile = (content: string, fileName: string, contentType: string) => {
        const a = document.createElement('a');
        const blob = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const exportToCSV = () => {
        const reportDate = formatDate(new Date().toISOString(), true);
        const headerRows = [
            { A: 'HistoPago' },
            { A: 'Reporte de Compromisos' },
            { A: `Cliente: ${customer?.name || 'N/A'}` },
            { A: `Identificación: ${customer?.identificationNumber || 'N/A'}` },
            { A: `Fecha de Generación: ${reportDate}` },
            { A: `Filtro de Estado: ${filterStatus}` },
            { A: '' } // Spacer row
        ];

        const dataToExport = filteredHistory.map(sale => ({
            'Comercio': sale.vendorName,
            'Fecha Compra': formatDate(sale.saleDate),
            'Fecha Vencimiento': formatDate(sale.dueDate),
            'Monto Total': sale.amount.toFixed(2),
            'Inicial': (sale.downPaymentAmount || 0).toFixed(2),
            'Saldo Pendiente': (sale.remainingBalance || 0).toFixed(2),
            'Estado': sale.status,
        }));
        const headerCsv = Papa.unparse(headerRows, { header: false });
        const dataCsv = Papa.unparse(dataToExport);

        downloadFile(`${headerCsv}\n${dataCsv}`, 'mis-compromisos.csv', 'text/csv;charset=utf-8;');
    };

    const exportToPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape' });
        const reportDate = formatDate(new Date().toISOString(), true);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16).text('HistoPago', 14, 20);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10).text('Reporte de Compromisos', 14, 27);
        doc.setFontSize(10).text(`Cliente: ${customer?.name || 'N/A'}`, 14, 32);
        doc.setFontSize(10).text(`Identificación: ${customer?.identificationNumber || 'N/A'}`, 14, 37);
        doc.setFontSize(8).text(`Fecha de Generación: ${reportDate}`, 14, 42);
        doc.setFontSize(8).text(`Filtro de Estado: ${filterStatus}`, 14, 47);

        (doc as any).autoTable({
            startY: 52,
            head: [['Comercio', 'Fecha Compra', 'Monto Total', 'Inicial', 'Financiado', 'Cuota', 'Pagadas', 'Saldo', 'Estado']],
            body: filteredHistory.map(sale => [
                sale.vendorName,
                formatDate(sale.saleDate),
                `$${sale.amount.toFixed(2)}`,
                `$${(sale.downPaymentAmount || 0).toFixed(2)}`,
                `$${(sale.amount - (sale.downPaymentAmount || 0)).toFixed(2)}`,
                `$${(sale.installmentAmount || 0).toFixed(2)}`,
                `${sale.paidInstallments || 0}/${sale.numberOfInstallments}`,
                `$${(sale.remainingBalance || 0).toFixed(2)}`,
                sale.status,
            ]),
            foot: [[
                { content: 'Deuda Total', colSpan: 7, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: `$${totals.totalPending.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold' } },
                ''
            ]],
            headStyles: { fillColor: [31, 41, 55], fontSize: 8 },
            bodyStyles: { fontSize: 8 },
            footStyles: { fillColor: [243, 244, 246], textColor: [31, 41, 55], fontSize: 9 },
            didParseCell: function(data: any) {
                if(data.column.index === 7) { // Saldo column
                    data.cell.styles.textColor = [220, 38, 38]; // red-600
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
        doc.save('mis-compromisos.pdf');
    };

    return (
        <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
                 <div>
                    <CardTitle>Mis Compromisos</CardTitle>
                    <CardDescription>Detalle de todos tus compromisos en la plataforma.</CardDescription>
                </div>
                <div className="flex items-center gap-2 pt-4 md:pt-0">
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Filtrar por estado" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Todos">Todos</SelectItem>
                            <SelectItem value="Pendiente de Confirmación">Pendiente de Confirmación</SelectItem>
                            <SelectItem value="Pendiente">Pendiente</SelectItem>
                            <SelectItem value="Pagado">Pagado</SelectItem>
                            <SelectItem value="Vencido">Vencido</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={exportToCSV}><Download className="mr-2 h-4 w-4" />CSV</Button>
                    <Button variant="outline" size="sm" onClick={exportToPDF}><Download className="mr-2 h-4 w-4" />PDF</Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Comercio</TableHead>
                                <TableHead>Fecha Compra</TableHead>
                                <TableHead>Fecha Venc.</TableHead>
                                <TableHead className="text-right">Monto Total</TableHead>
                                <TableHead className="text-right">Inicial</TableHead>
                                <TableHead className="text-right">Saldo Pendiente</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-center">Acción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredHistory.map(sale => (
                                <TableRow key={sale.id}>
                                    <TableCell className="font-medium">{sale.vendorName}</TableCell>
                                    <TableCell>{formatDate(sale.saleDate)}</TableCell>
                                    <TableCell>{formatDate(sale.dueDate)}</TableCell>
                                    <TableCell className="text-right">${sale.amount.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">${(sale.downPaymentAmount || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right text-red-600 font-semibold">${(sale.remainingBalance || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={cn("border-transparent", statusColors[sale.status ?? 'Pendiente'])}>
                                            {sale.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {sale.status === 'Pendiente de Confirmación' ? (
                                            <ConfirmationDialog sale={sale} onConfirmed={onSaleAction} />
                                        ) : (
                                            <PaymentDialog
                                                actorRole="customer"
                                                sale={sale}
                                                pendingBalance={sale.remainingBalance || 0}
                                                onPaymentReported={onSaleAction}
                                            >
                                                <Button size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                                                    <Wallet className="mr-2 h-4 w-4" />
                                                    Reportar Pago
                                                </Button>
                                            </PaymentDialog>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                         <TableFooter>
                            <TableRow>
                                <TableCell colSpan={5} className="font-bold text-right">Deuda Total ({filterStatus})</TableCell>
                                <TableCell className="text-right font-bold text-red-600">${totals.totalPending.toFixed(2)}</TableCell>
                                <TableCell colSpan={2}></TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
                 {filteredHistory.length === 0 && (
                    <div className="text-center p-8 border-2 border-dashed rounded-lg mt-4">
                        <p>No se encontraron compromisos con el estado "{filterStatus}".</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function CustomerCommitmentsPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<GetCustomerHistoryOutput | null>(null);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [updateTrigger, setUpdateTrigger] = useState(0);

    const fetchData = async () => {
        if (isUserLoading) return;
        if (!user || !firestore) {
            setError("Debes iniciar sesión para ver tus compromisos.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        
        try {
            // 1. Fetch customer profile to get their identification number
            const customerRef = doc(firestore, 'customers', user.uid);
            const docSnap = await getDoc(customerRef);
            
            if (!docSnap.exists()) {
                throw new Error("No se pudo encontrar tu perfil de cliente.");
            }
            const customerData = docSnap.data() as Customer;
            setCustomer(customerData);

            // 2. Fetch history using the identification number
            const historyData = await getCustomerHistory({ customerIdentification: customerData.identificationNumber });
            setHistory(historyData);

        } catch (err: any) {
            console.error("Error fetching commitments:", err);
            setError(err.message || 'Ocurrió un error al cargar tus datos.');
            toast({
                variant: 'destructive',
                title: 'Error al Cargar',
                description: err.message,
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, isUserLoading, firestore, updateTrigger]);
    
    const handleSaleAction = () => {
        // Trigger a re-fetch of the history data
        setUpdateTrigger(prev => prev + 1);
        toast({
            title: 'Actualizando Historial',
            description: 'Refrescando tus compromisos...',
        });
    };

    if (loading) {
        return (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-lg font-medium">Cargando tus compromisos...</p>
            </div>
        )
    }
    
    if (error) {
        return (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-red-300 bg-red-50">
                <FileText className="h-8 w-8 text-red-500" />
                <p className="mt-4 text-lg font-medium text-red-700">Error al Cargar Compromisos</p>
                <p className="mt-2 text-sm text-red-600">{error}</p>
            </div>
        );
    }
    
    if (!history || history.history.length === 0) {
        return (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="mt-4 text-lg font-medium">No se encontraron compromisos</p>
                <p className="mt-2 text-sm text-muted-foreground">Parece que aún no tienes créditos registrados en HistoPago.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <HistoryTable history={history.history} onSaleAction={handleSaleAction} customer={customer} />
        </div>
    );
}
