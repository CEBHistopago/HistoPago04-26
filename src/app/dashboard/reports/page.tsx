'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, BarChart2, DollarSign, Users, Download, Send, MoreVertical, FileClock, Hourglass, MailWarning, History, Eye, MessageSquareWarning, Filter } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
    Table, 
    TableBody, 
    TableCell, 
    TableHead, 
    TableHeader, 
    TableRow,
    TableFooter
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import type { CreditSale, AgingReportData, BulkImportReport, Vendor } from '@/lib/data';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { cn, formatCurrency } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';
import { sendManualReminder } from '@/ai/flows/send-manual-reminder-flow';
import { getImportReports } from '@/ai/flows/get-import-reports-flow';
import { getAgingReport, getCashFlowReport } from '@/ai/flows/dashboard-reports-flow';


interface SalesReportStats {
    totalSalesCount: number;
    totalAmountSold: number;
    sales: CreditSale[];
}

interface CashFlowEntry {
    id: string;
    transactionDate: string;
    customerName: string;
    invoiceNumber: string;
    creditSaleId: string;
    amount: number;
    concept: string;
}

interface CashFlowReportStats {
    totalTransactionsCount: number;
    totalAmountReceived: number;
    transactions: CashFlowEntry[];
}

type AgingBucket = 'totalDue' | 'current' | 'days1_30' | 'days31_60' | 'days61_90' | 'days91_plus' | null;

function ReportsContent() {
    const { user } = useUser();
    const firestore = useFirestore();
    const router = useRouter();
    const { toast } = useToast();
    const searchParams = useSearchParams();

    // State for Sales Report
    const [salesStartDate, setSalesStartDate] = useState('');
    const [salesEndDate, setSalesEndDate] = useState('');
    const [salesReportLoading, setSalesReportLoading] = useState(false);
    const [salesReportData, setSalesReportData] = useState<SalesReportStats | null>(null);
    const [salesVendorFilter, setSalesVendorFilter] = useState('all');
    const [salesStatusFilter, setSalesStatusFilter] = useState('all');
    const [salesTypeFilter, setSalesTypeFilter] = useState('all');

    // State for Aging Report
    const [agingReportDate, setAgingReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [agingReportLoading, setAgingReportLoading] = useState(false);
    const [agingReportData, setAgingReportData] = useState<AgingReportData[] | null>(null);
    const [activeAgingBucket, setActiveAgingBucket] = useState<AgingBucket>(null);
    const [sendingNotification, setSendingNotification] = useState<string | null>(null);
    
    // State for Cash Flow Report
    const [cashFlowStartDate, setCashFlowStartDate] = useState('');
    const [cashFlowEndDate, setCashFlowEndDate] = useState('');
    const [cashFlowReportLoading, setCashFlowReportLoading] = useState(false);
    const [cashFlowReportData, setCashFlowReportData] = useState<CashFlowReportStats | null>(null);
    const [cashFlowConceptFilter, setCashFlowConceptFilter] = useState<string>('all');

    // State for Import Reports
    const [importReports, setImportReports] = useState<BulkImportReport[]>([]);
    const [importReportsLoading, setImportReportsLoading] = useState(true);
    const [selectedErrors, setSelectedErrors] = useState<string[]>([]);
    const [isErrorDialogOpwn, setIsErrorDialogOpen] = useState(false);

    // Vendor Plan state
    const [vendorData, setVendorData] = useState<Vendor | null>(null);

    useEffect(() => {
        if (!user || !firestore) return;

        const fetchVendorAndReports = async () => {
            setImportReportsLoading(true);
            try {
                const vendorRef = doc(firestore, 'vendors', user.uid);
                const vendorDoc = await getDoc(vendorRef);

                if (vendorDoc.exists()) {
                    setVendorData(vendorDoc.data() as Vendor);
                }

                const reports = await getImportReports(user.uid);
                setImportReports(reports);
            } catch (error) {
                console.error("Failed to fetch initial data:", error);
            } finally {
                setImportReportsLoading(false);
            }
        };
        
        fetchVendorAndReports();
    }, [user, firestore, toast]);

    const formatDate = (date: any, includeTime: boolean = false) => {
        if (!date) return 'N/A';
        try {
            const d = typeof date === 'string' ? parseISO(date) : (date.toDate ? date.toDate() : new Date(date));
            return format(d, includeTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
        } catch (error) {
            return 'Fecha inválida';
        }
    };

    const handleGenerateSalesReport = async () => {
        if (!user || !firestore) {
            toast({ variant: 'destructive', title: 'Error', description: 'Usuario no autenticado.' });
            return;
        }
        if (!salesStartDate || !salesEndDate) {
            toast({ variant: 'destructive', title: 'Fechas requeridas', description: 'Por favor, selecciona una fecha de inicio y de fin.' });
            return;
        }

        setSalesReportLoading(true);
        setSalesReportData(null);
        setSalesVendorFilter('all');
        setSalesStatusFilter('all');
        setSalesTypeFilter('all');

        try {
            const start = new Date(`${salesStartDate}T00:00:00Z`);
            const end = new Date(`${salesEndDate}T23:59:59Z`);

            const salesRef = collection(firestore, 'vendors', user.uid, 'sales');
            const salesSnapshot = await getDocs(salesRef);

            const filteredSales: CreditSale[] = [];
            let totalAmount = 0;

            salesSnapshot.forEach(doc => {
                const sale = { id: doc.id, ...doc.data() } as CreditSale;
                const saleDate = sale.saleDate.toDate();

                if (saleDate >= start && saleDate <= end) {
                    filteredSales.push(sale);
                    totalAmount += sale.amount;
                }
            });

            filteredSales.sort((a, b) => {
                const dateCompare = b.saleDate.toDate().getTime() - a.saleDate.toDate().getTime();
                if (dateCompare !== 0) return dateCompare;
                return b.invoiceNumber.localeCompare(a.invoiceNumber);
            });

            setSalesReportData({
                totalSalesCount: filteredSales.length,
                totalAmountSold: totalAmount,
                sales: filteredSales,
            });

            if (filteredSales.length === 0) {
                 toast({ title: 'Sin resultados', description: 'No se encontraron registros en el rango de fechas seleccionado.' });
            }

        } catch (error: any) {
            console.error("Error generating sales report:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el reporte de ventas.' });
        } finally {
            setSalesReportLoading(false);
        }
    };

    const uniqueSalesVendors = useMemo(() => {
        if (!salesReportData) return [];
        const vendors = new Set(salesReportData.sales.map(s => s.salesPerson || 'Sin Asignar'));
        return Array.from(vendors).sort();
    }, [salesReportData]);

    const uniqueSalesTypes = useMemo(() => {
        if (!salesReportData) return [];
        const types = new Set(salesReportData.sales.map(s => s.creditType));
        return Array.from(types).sort();
    }, [salesReportData]);

    const filteredSalesReport = useMemo(() => {
        if (!salesReportData) return null;
        
        let filtered = [...salesReportData.sales];
        
        if (salesVendorFilter !== 'all') {
            filtered = filtered.filter(s => (s.salesPerson || 'Sin Asignar') === salesVendorFilter);
        }
        
        if (salesStatusFilter !== 'all') {
            filtered = filtered.filter(s => s.status === salesStatusFilter);
        }

        if (salesTypeFilter !== 'all') {
            filtered = filtered.filter(s => s.creditType === salesTypeFilter);
        }
        
        const totalAmount = filtered.reduce((sum, s) => sum + s.amount, 0);
        
        return {
            totalSalesCount: filtered.length,
            totalAmountSold: totalAmount,
            sales: filtered,
        };
    }, [salesReportData, salesVendorFilter, salesStatusFilter, salesTypeFilter]);
    
    const handleGenerateAgingReport = async () => {
        if (!user) return;
        if (!agingReportDate) {
            toast({ variant: 'destructive', title: 'Fecha requerida', description: 'Por favor, selecciona una fecha para el reporte.' });
            return;
        }
    
        setAgingReportLoading(true);
        setAgingReportData(null);
        setActiveAgingBucket(null);
    
        try {
            const result = await getAgingReport({ vendorId: user.uid, reportDate: agingReportDate });
            setAgingReportData(result);
    
            if (result.length === 0) {
                toast({ title: 'Sin Resultados', description: 'No se encontraron deudas pendientes en la fecha seleccionada.' });
            }
        } catch (error: any) {
            console.error("Error generating aging report:", error);
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'No se pudo generar el reporte.' });
        } finally {
            setAgingReportLoading(false);
        }
    };

    const handleGenerateCashFlowReport = async () => {
        if (!user) return;
        if (!cashFlowStartDate || !cashFlowEndDate) {
            toast({ variant: 'destructive', title: 'Fechas requeridas', description: 'Por favor, selecciona un rango de fechas.' });
            return;
        }
    
        setCashFlowReportLoading(true);
        setCashFlowReportData(null);
    
        try {
            const result = await getCashFlowReport({
                vendorId: user.uid,
                startDate: cashFlowStartDate,
                endDate: cashFlowEndDate,
            });
            
            setCashFlowReportData(result);
            
            if (result.transactions.length === 0) {
                toast({ title: 'Sin resultados', description: 'No se encontraron cobros en el rango seleccionado.' });
            }
    
        } catch (error: any) {
            console.error("Error generating cash flow report:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo generar el reporte de cobros.' });
        } finally {
            setCashFlowReportLoading(false);
        }
    };

    const handleRowClick = (saleId: string) => {
        router.push(`/dashboard/sales#${saleId}`);
    };

    const handleSendNotification = async (customer: AgingReportData) => {
        if (!user || !user.displayName) {
            toast({ variant: 'destructive', title: 'Error', description: 'Falta información del vendedor.' });
            return;
        }

        if (!customer.customerEmail) {
            toast({ variant: 'destructive', title: 'El cliente no tiene un correo electrónico registrado.' });
            return;
        }

        setSendingNotification(customer.customerIdentification);
        try {
            const salesSummary = customer.salesHistory.map(s => `Documento #${s.invoiceNumber}: Saldo $${formatCurrency(s.remainingBalance)}`).join('\n');
            
            const result = await sendManualReminder({
                vendorId: user.uid,
                vendorName: user.displayName,
                vendorEmail: user.email || undefined,
                customerIdentification: customer.customerIdentification,
                emailPayload: {
                    to: customer.customerEmail,
                    customerName: customer.customerName,
                    dueAmount: customer.totalDue,
                    salesHistory: salesSummary,
                }
            });

            if (result.success) {
                toast({ title: 'Recordatorio Enviado', description: `Se ha enviado un correo de cobro a ${customer.customerName}.` });
            } else {
                throw new Error(result.message);
            }

        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al Enviar', description: error.message });
        } finally {
            setSendingNotification(null);
        }
    };


    const agingReportTotals = useMemo(() => {
        if (!agingReportData) return null;
    
        return agingReportData.reduce((acc, row) => {
            acc.totalDue += row.totalDue;
            acc.current += row.current;
            acc.days1_30 += row.days1_30;
            acc.days31_60 += row.days31_60;
            acc.days61_90 += row.days61_90;
            acc.days91_plus += row.days91_plus;
            return acc;
        }, {
            totalDue: 0,
            salesCount: 0, 
            current: 0,
            days1_30: 0,
            days31_60: 0,
            days61_90: 0,
            days91_plus: 0,
        });
    }, [agingReportData]);

    const filteredAgingData = useMemo(() => {
        if (!agingReportData) return [];
        if (!activeAgingBucket) return agingReportData;
        return agingReportData.filter(row => row[activeAgingBucket] > 0);
    }, [agingReportData, activeAgingBucket]);

    const agingSummaryCards = useMemo(() => {
        if (!agingReportData || !agingReportTotals) return null;
    
        const getClientCountForBucket = (bucket: AgingBucket) => {
            if (!bucket) return agingReportData.length;
            return agingReportData.filter(row => row[bucket] > 0.01).length;
        };
    
        const totalClientsWithDebt = agingReportData.length;
        if (totalClientsWithDebt === 0) return []; 
    
        return [
            { id: 'current', label: 'Corriente', amount: agingReportTotals.current, clientCount: getClientCountForBucket('current'), color: 'text-blue-600' },
            { id: 'days1_30', label: '1-30 Días', amount: agingReportTotals.days1_30, clientCount: getClientCountForBucket('days1_30'), color: 'text-yellow-600' },
            { id: 'days31_60', label: '31-60 Días', amount: agingReportTotals.days31_60, clientCount: getClientCountForBucket('days31_60'), color: 'text-orange-600' },
            { id: 'days61_90', label: '61-90 Días', amount: agingReportTotals.days61_90, clientCount: getClientCountForBucket('days61_90'), color: 'text-red-600' },
            { id: 'days91_plus', label: '+90 Días', amount: agingReportTotals.days91_plus, clientCount: getClientCountForBucket('days91_plus'), color: 'text-red-800' },
        ].map(card => ({
            ...card,
            percentage: (card.clientCount / totalClientsWithDebt) * 100,
        }));
    }, [agingReportData, agingReportTotals]);

    const cashFlowConcepts = useMemo(() => {
        if (!cashFlowReportData) return [];
        const concepts = new Set(cashFlowReportData.transactions.map(t => t.concept));
        const sortedConcepts = Array.from(concepts).sort((a, b) => a.localeCompare(b));
        return ['all', ...sortedConcepts];
    }, [cashFlowReportData]);
    
    const filteredCashFlowData = useMemo(() => {
        if (!cashFlowReportData) return null;
        
        const filteredTransactions = cashFlowConceptFilter === 'all'
            ? cashFlowReportData.transactions
            : cashFlowReportData.transactions.filter(t => t.concept === cashFlowConceptFilter);
    
        const totalAmount = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);
    
        return {
            totalTransactionsCount: filteredTransactions.length,
            totalAmountReceived: totalAmount,
            transactions: filteredTransactions,
        };
    }, [cashFlowReportData, cashFlowConceptFilter]);

    const getReportHeader = (title: string) => {
        const vendorName = user?.displayName || 'Comercio Desconocido';
        const generationTime = format(new Date(), 'dd/MM/yyyy HH:mm:ss');
        return {
            vendorName,
            generationTime,
            title
        };
    };

    const downloadFile = (content: string, fileName: string, contentType: string) => {
        const a = document.createElement('a');
        const blob = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const handleExportSalesCSV = () => {
        if (!filteredSalesReport || !user) return;
        const header = getReportHeader(`Reporte de Ventas (${formatDate(salesStartDate)} - ${formatDate(salesEndDate)})`);

        const dataToExport = filteredSalesReport.sales.map((s, index) => ({
            '#': index + 1,
            'Fecha Venta': formatDate(s.saleDate),
            'Cliente': s.customerName,
            'Identificación': s.customerIdentification,
            'Nro. Documento': s.invoiceNumber,
            'Tipo': s.creditType,
            'Vendedor': s.salesPerson || 'N/A',
            'Estado': s.status,
            'Monto Cuota': (s.installmentAmount || 0).toFixed(2),
            'Monto Total': s.amount.toFixed(2),
        }));
        const headerRows = [
            { A: header.vendorName },
            { A: header.title },
            { A: `Filtro Vendedor: ${salesVendorFilter === 'all' ? 'Todos' : salesVendorFilter}`},
            { A: `Filtro Estado: ${salesStatusFilter === 'all' ? 'Todos' : salesStatusFilter}`},
            { A: `Filtro Tipo: ${salesTypeFilter === 'all' ? 'Todos' : salesTypeFilter}`},
            { A: `Total de registros: ${filteredSalesReport.sales.length}`},
            { A: `Generado: ${header.generationTime}` },
            { A: '' }
        ];
        
        const csv = Papa.unparse(dataToExport);
        const headerCsv = Papa.unparse(headerRows, { header: false });
        
        downloadFile(`${headerCsv}\n${csv}`, 'reporte_ventas.csv', 'text/csv;charset=utf-8;');
    };

    const handleExportSalesPDF = () => {
        if (!filteredSalesReport || !user) return;
        const header = getReportHeader(`Reporte de Ventas (${formatDate(salesStartDate)} - ${formatDate(salesEndDate)})`);
        const doc = new jsPDF({ orientation: 'landscape' });
        
        doc.setFontSize(14).text(header.vendorName, 14, 15);
        doc.setFontSize(10).text(header.title, 14, 22);
        doc.setFontSize(8).text(`Filtros - Vendedor: ${salesVendorFilter === 'all' ? 'Todos' : salesVendorFilter}, Estado: ${salesStatusFilter === 'all' ? 'Todos' : salesStatusFilter}, Tipo: ${salesTypeFilter === 'all' ? 'Todos' : salesTypeFilter}`, 14, 27);
        doc.setFontSize(8).text(`Generado: ${header.generationTime}`, 14, 32);

        (doc as any).autoTable({
            startY: 37,
            head: [['#', 'Fecha', 'Cliente', 'Identificación', 'Documento', 'Tipo', 'Vendedor', 'Estado', 'Cuota ($)', 'Monto ($)']],
            body: filteredSalesReport.sales.map((s, index) => [
                index + 1,
                formatDate(s.saleDate),
                s.customerName,
                s.customerIdentification,
                s.invoiceNumber,
                s.creditType,
                s.salesPerson || 'N/A',
                s.status || 'N/A',
                formatCurrency(s.installmentAmount),
                formatCurrency(s.amount)
            ]),
            columnStyles: {
                0: { cellWidth: 10 },
                5: { cellWidth: 35 },
            },
            foot: [['Total', filteredSalesReport.sales.length, '', '', '', '', '', '', '', formatCurrency(filteredSalesReport.totalAmountSold)]]
        });
        doc.save('reporte_ventas.pdf');
    };

    const handleExportAgingCSV = () => {
        if (!filteredAgingData || !user) return;
        const header = getReportHeader(`Reporte de Cuentas por Cobrar al ${formatDate(agingReportDate)}`);
        
        const dataToExport = filteredAgingData.map((r, index) => ({
            '#': index + 1,
            'Cliente': r.customerName,
            'Identificación': r.customerIdentification,
            'Nro. Documentos': r.salesCount,
            'Total Deuda': r.totalDue.toFixed(2),
            'Corriente': r.current.toFixed(2),
            '1-30 Días': r.days1_30.toFixed(2),
            '31-60 Días': r.days31_60.toFixed(2),
            '61-90 Días': r.days61_90.toFixed(2),
            '+90 Días': r.days91_plus.toFixed(2),
        }));

        const headerRows = [
            { A: header.vendorName },
            { A: header.title },
            { A: `Total de clientes: ${filteredAgingData.length}`},
            { A: `Generado: ${header.generationTime}` },
            { A: '' }
        ];

        const csv = Papa.unparse(dataToExport);
        const headerCsv = Papa.unparse(headerRows, { header: false });
        
        downloadFile(`${headerCsv}\n${csv}`, 'reporte_cuentas_por_cobrar.csv', 'text/csv;charset=utf-8;');
    };

    const handleExportAgingPDF = () => {
        if (!filteredAgingData || !agingReportTotals || !user) return;
        const header = getReportHeader(`Reporte de Cuentas por Cobrar al ${formatDate(agingReportDate)}`);
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(14).text(header.vendorName, 14, 15);
        doc.setFontSize(10).text(header.title, 14, 22);
        doc.setFontSize(8).text(`Generado: ${header.generationTime}`, 14, 27);
        
        (doc as any).autoTable({
            startY: 32,
            head: [['#', 'Cliente', 'Nro. Documentos', 'Total Deuda', 'Corriente', '1-30 Días', '31-60 Días', '61-90 Días', '+90 Días']],
            body: filteredAgingData.map((r, index) => [
                index + 1,
                r.customerName,
                r.salesCount,
                `$${formatCurrency(r.totalDue)}`,
                `$${formatCurrency(r.current)}`,
                `$${formatCurrency(r.days1_30)}`,
                `$${formatCurrency(r.days31_60)}`,
                `$${formatCurrency(r.days61_90)}`,
                `$${formatCurrency(r.days91_plus)}`
            ]),
            columnStyles: {
                0: { cellWidth: 12 },
            },
            foot: [[
                'Total',
                filteredAgingData.length,
                '',
                `$${formatCurrency(agingReportTotals.totalDue)}`,
                `$${formatCurrency(agingReportTotals.current)}`,
                `$${formatCurrency(agingReportTotals.days1_30)}`,
                `$${formatCurrency(agingReportTotals.days31_60)}`,
                `$${formatCurrency(agingReportTotals.days61_90)}`,
                `$${formatCurrency(agingReportTotals.days91_plus)}`
            ]]
        });
        doc.save('reporte_cuentas_por_cobrar.pdf');
    };

    const handleExportCashFlowCSV = () => {
        if (!filteredCashFlowData || !user) return;
        const title = `Reporte de Cobros (${formatDate(cashFlowStartDate)} - ${formatDate(cashFlowEndDate)})`;
        const header = getReportHeader(title);

        const dataToExport = filteredCashFlowData.transactions.map((t, index) => ({
            '#': index + 1,
            'Fecha': formatDate(t.transactionDate),
            'Cliente': t.customerName,
            'Nro. Documento': t.invoiceNumber,
            'Concepto': t.concept,
            'Monto Recibido': t.amount.toFixed(2)
        }));
        
        const headerRows = [
            { A: header.vendorName },
            { A: header.title },
            { A: `Filtro: ${cashFlowConceptFilter === 'all' ? 'Todos' : cashFlowConceptFilter}`},
            { A: `Total transacciones: ${filteredCashFlowData.transactions.length}`},
            { A: `Generado: ${header.generationTime}` },
            { A: '' }
        ];

        const csv = Papa.unparse(dataToExport);
        const headerCsv = Papa.unparse(headerRows, { header: false });
        
        downloadFile(`${headerCsv}\n${csv}`, 'reporte_cobros.csv', 'text/csv;charset=utf-8;');
    };

    const handleExportCashFlowPDF = () => {
        if (!filteredCashFlowData || !user) return;
        const title = `Reporte de Cobros (${formatDate(cashFlowStartDate)} - ${formatDate(cashFlowEndDate)})`;
        const header = getReportHeader(title);
        const doc = new jsPDF();

        doc.setFontSize(14).text(header.vendorName, 14, 15);
        doc.setFontSize(10).text(header.title, 14, 22);
        doc.setFontSize(8).text(`Filtro: ${cashFlowConceptFilter === 'all' ? 'Todos' : cashFlowConceptFilter}`, 14, 27);
        doc.setFontSize(8).text(`Generado: ${header.generationTime}`, 14, 32);

        (doc as any).autoTable({
            startY: 37,
            head: [['#', 'Fecha', 'Cliente', 'Nro. Documento', 'Concepto', 'Monto Recibido ($)']],
            body: filteredCashFlowData.transactions.map((t, index) => [
                index + 1,
                formatDate(t.transactionDate),
                t.customerName,
                t.invoiceNumber,
                t.concept,
                formatCurrency(t.amount)
            ]),
            columnStyles: {
                0: { cellWidth: 12 },
            },
            foot: [['Total', filteredCashFlowData.transactions.length, '', '', '', formatCurrency(filteredCashFlowData.totalAmountReceived)]]
        });
        doc.save('reporte_cobros.pdf');
    };

    const canSendNotifications = vendorData?.plan === 'HistoGestion' || vendorData?.plan === 'HistoAlquiler';
    const isRentalPlan = vendorData?.plan === 'HistoAlquiler';


    return (
        <div className="grid gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Reportes</h1>
                    <p className="text-muted-foreground">Analiza tus datos para tomar mejores decisiones.</p>
                </div>
            </div>
            
            {/* Sales Report Section */}
            {!isRentalPlan && (
                <Card>
                    <CardHeader>
                        <CardTitle>Reporte de Ventas por Período</CardTitle>
                        <CardDescription>Elige un rango de fechas para generar el reporte de ventas.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="grid gap-2 w-full sm:w-auto">
                            <Label htmlFor="start-date">Fecha de Inicio</Label>
                            <Input id="start-date" type="date" value={salesStartDate} onChange={(e) => setSalesStartDate(e.target.value)} disabled={salesReportLoading} />
                        </div>
                        <div className="grid gap-2 w-full sm:w-auto">
                            <Label htmlFor="end-date">Fecha de Fin</Label>
                            <Input id="end-date" type="date" value={salesEndDate} onChange={(e) => setSalesEndDate(e.target.value)} disabled={salesReportLoading}/>
                        </div>
                        <Button onClick={handleGenerateSalesReport} disabled={salesReportLoading} className="w-full sm:w-auto">
                            {salesReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            <span className="ml-2">Generar Reporte de Ventas</span>
                        </Button>
                    </CardContent>
                </Card>
            )}

            {salesReportLoading && (
                 <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-lg font-medium">Generando reporte de ventas...</p>
                 </div>
            )}

            {salesReportData && filteredSalesReport && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Total de Registros</CardTitle>
                                <CardDescription>Número de operaciones en el período {salesVendorFilter !== 'all' || salesStatusFilter !== 'all' || salesTypeFilter !== 'all' ? '(con filtros)' : ''}.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{filteredSalesReport.totalSalesCount}</p>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle>Monto Total</CardTitle>
                                <CardDescription>Suma del valor de las operaciones {salesVendorFilter !== 'all' || salesStatusFilter !== 'all' || salesTypeFilter !== 'all' ? '(con filtros)' : ''}.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-primary">${formatCurrency(filteredSalesReport.totalAmountSold)}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <CardTitle>Detalle de Operaciones</CardTitle>
                                    <CardDescription>Analiza el desglose de tus operaciones a crédito.</CardDescription>
                                </div>
                                <div className="flex flex-wrap items-end gap-3 w-full md:w-auto">
                                    <div className="grid gap-1.5 w-full sm:w-auto">
                                        <Label htmlFor="sales-vendor-filter" className="text-xs">Vendedor</Label>
                                        <Select value={salesVendorFilter} onValueChange={setSalesVendorFilter}>
                                            <SelectTrigger id="sales-vendor-filter" className="h-8 w-full sm:w-[180px] text-xs">
                                                <SelectValue placeholder="Vendedor" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos los Vendedores</SelectItem>
                                                {uniqueSalesVendors.map(v => (
                                                    <SelectItem key={v} value={v}>{v}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-1.5 w-full sm:w-auto">
                                        <Label htmlFor="sales-type-filter" className="text-xs">Tipo Financiamiento</Label>
                                        <Select value={salesTypeFilter} onValueChange={setSalesTypeFilter}>
                                            <SelectTrigger id="sales-type-filter" className="h-8 w-full sm:w-[180px] text-xs">
                                                <SelectValue placeholder="Tipo" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos los Tipos</SelectItem>
                                                {uniqueSalesTypes.map(t => (
                                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-1.5 w-full sm:w-auto">
                                        <Label htmlFor="sales-status-filter" className="text-xs">Estado</Label>
                                        <Select value={salesStatusFilter} onValueChange={setSalesStatusFilter}>
                                            <SelectTrigger id="sales-status-filter" className="h-8 w-full sm:w-[150px] text-xs">
                                                <SelectValue placeholder="Estado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos los Estados</SelectItem>
                                                <SelectItem value="Pagado">Pagado</SelectItem>
                                                <SelectItem value="Pendiente">Pendiente</SelectItem>
                                                <SelectItem value="Vencido">Vencido</SelectItem>
                                                <SelectItem value="Pendiente de Confirmación">Pend. Confirmación</SelectItem>
                                                <SelectItem value="Cerrado Administrativamente">Cerrado Admin.</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex gap-2 ml-auto">
                                        <Button variant="outline" size="sm" onClick={handleExportSalesCSV} className="h-8 text-xs"><Download className="h-3 w-3 mr-1" />CSV</Button>
                                        <Button variant="outline" size="sm" onClick={handleExportSalesPDF} className="h-8 text-xs"><Download className="h-3 w-3 mr-1" />PDF</Button>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px] text-center">#</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Cliente</TableHead>
                                            <TableHead>Identificación</TableHead>
                                            <TableHead>Documento</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Vendedor</TableHead>
                                            <TableHead className="text-center">Estado</TableHead>
                                            <TableHead className="text-right">Cuota</TableHead>
                                            <TableHead className="text-right">Monto Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredSalesReport.sales.map((sale, index) => (
                                            <TableRow key={sale.id} onClick={() => handleRowClick(sale.id)} className="cursor-pointer hover:bg-muted/50 transition-colors">
                                                <TableCell className="text-muted-foreground font-mono text-xs text-center border-r">{index + 1}</TableCell>
                                                <TableCell>{formatDate(sale.saleDate)}</TableCell>
                                                <TableCell className="font-medium">{sale.customerName}</TableCell>
                                                <TableCell>{sale.customerIdentification}</TableCell>
                                                <TableCell>{sale.invoiceNumber}</TableCell>
                                                <TableCell className="text-xs">{sale.creditType}</TableCell>
                                                <TableCell>{sale.salesPerson || 'N/A'}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant={sale.status === 'Pagado' ? 'default' : sale.status === 'Vencido' ? 'destructive' : 'secondary'} className={cn(sale.status === 'Pagado' && "bg-green-100 text-green-800 hover:bg-green-100")}>
                                                        {sale.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">${formatCurrency(sale.installmentAmount)}</TableCell>
                                                <TableCell className="text-right font-semibold">${formatCurrency(sale.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                    <TableFooter>
                                        <TableRow>
                                            <TableCell className="text-center font-bold">Total</TableCell>
                                            <TableCell className="font-bold">{filteredSalesReport.totalSalesCount}</TableCell>
                                            <TableCell colSpan={7} className="text-right font-bold"></TableCell>
                                            <TableCell className="text-right font-bold">${formatCurrency(filteredSalesReport.totalAmountSold)}</TableCell>
                                        </TableRow>
                                    </TableFooter>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Aging Report Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Reporte de Cuentas por Cobrar</CardTitle>
                    <CardDescription>Analiza las cuentas por cobrar por cliente y antigüedad de la deuda en una fecha específica.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="aging-date">Calcular al:</Label>
                        <Input id="aging-date" type="date" value={agingReportDate} onChange={(e) => setAgingReportDate(e.target.value)} disabled={agingReportLoading} />
                    </div>
                    <Button onClick={handleGenerateAgingReport} disabled={agingReportLoading} className="w-full sm:w-auto">
                        {agingReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart2 className="h-4 w-4" />}
                        <span className="ml-2">Generar Reporte de Cuentas por Cobrar</span>
                    </Button>
                </CardContent>
            </Card>

            {agingReportLoading && (
                <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-lg font-medium">Calculando cuentas por cobrar...</p>
                </div>
            )}

            {agingReportData && (
                <div className="space-y-4">
                     {agingSummaryCards && agingSummaryCards.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold mb-2">Resumen por Antigüedad</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {agingSummaryCards.map(card => (
                                    <Card key={card.id} onClick={() => setActiveAgingBucket(card.id as AgingBucket)} className={cn("cursor-pointer hover:shadow-md transition-shadow", activeAgingBucket === card.id && 'ring-2 ring-primary')}>
                                        <CardHeader className="pb-2">
                                            <CardTitle className={cn("text-base", card.color)}>{card.label}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <p className={cn("text-2xl font-bold", card.color)}>${formatCurrency(card.amount)}</p>
                                            <div className="flex items-center text-sm text-muted-foreground">
                                                <Users className="h-4 w-4 mr-1" />
                                                <span>{card.clientCount} {card.clientCount === 1 ? 'cliente' : 'clientes'} ({card.percentage.toFixed(1)}%)</span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                    <Card>
                        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <CardTitle>Detalle de Cuentas por Cobrar al {formatDate(agingReportDate)}</CardTitle>
                                <CardDescription>
                                    {activeAgingBucket ? `Mostrando clientes con saldo en "${agingSummaryCards?.find(c => c.id === activeAgingBucket)?.label}".` : 'Mostrando todos los clientes con saldo pendiente.'}
                                    {activeAgingBucket && <Button variant="link" size="sm" onClick={() => setActiveAgingBucket(null)}>Mostrar todos</Button>}
                                </CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={handleExportAgingCSV}><Download className="h-4 w-4 mr-2" />CSV</Button>
                                <Button variant="outline" size="sm" onClick={handleExportAgingPDF}><Download className="h-4 w-4 mr-2" />PDF</Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px] text-center">#</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead className="text-center">Total Deuda</TableHead>
                                        <TableHead className="text-right">Corriente</TableHead>
                                        <TableHead className="text-right">1-30 Días</TableHead>
                                        <TableHead className="text-right">31-60 Días</TableHead>
                                        <TableHead className="text-right">61-90 Días</TableHead>
                                        <TableHead className="text-right">+90 Días</TableHead>
                                        <TableHead className="text-center">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAgingData.map((row, index) => (
                                        <TableRow key={row.customerIdentification}>
                                            <TableCell className="text-muted-foreground font-mono text-xs text-center border-r">{index + 1}</TableCell>
                                            <TableCell className="font-medium">{row.customerName}</TableCell>
                                            <TableCell className="text-center font-bold">${formatCurrency(row.totalDue)}</TableCell>
                                            <TableCell className="text-right">${formatCurrency(row.current)}</TableCell>
                                            <TableCell className="text-right text-yellow-600">${formatCurrency(row.days1_30)}</TableCell>
                                            <TableCell className="text-right text-orange-600">${formatCurrency(row.days31_60)}</TableCell>
                                            <TableCell className="text-right text-red-600">${formatCurrency(row.days61_90)}</TableCell>
                                            <TableCell className="text-right text-red-800 font-bold">${formatCurrency(row.days91_plus)}</TableCell>
                                            <TableCell className="text-center">
                                                 <Button size="sm" variant="outline" onClick={() => handleSendNotification(row)} disabled={!canSendNotifications || sendingNotification === row.customerIdentification} title={!canSendNotifications ? 'Mejora tu plan para activar las notificaciones' : 'Enviar recordatorio por correo'}>
                                                    {sendingNotification === row.customerIdentification ? <Loader2 className="h-4 w-4 animate-spin"/> : <MailWarning className="h-4 w-4" />}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                {agingReportTotals && (
                                    <TableFooter>
                                        <TableRow>
                                            <TableCell className="text-center font-bold">Total</TableCell>
                                            <TableCell className="font-bold">{filteredAgingData.length}</TableCell>
                                            <TableCell className="text-center font-bold">${formatCurrency(agingReportTotals.totalDue)}</TableCell>
                                            <TableCell className="text-right font-bold">${formatCurrency(agingReportTotals.current)}</TableCell>
                                            <TableCell className="text-right font-bold text-yellow-600">${formatCurrency(agingReportTotals.days1_30)}</TableCell>
                                            <TableCell className="text-right font-bold text-orange-600">${formatCurrency(agingReportTotals.days31_60)}</TableCell>
                                            <TableCell className="text-right font-bold text-red-600">${formatCurrency(agingReportTotals.days61_90)}</TableCell>
                                            <TableCell className="text-right font-bold text-red-800">${formatCurrency(agingReportTotals.days91_plus)}</TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    </TableFooter>
                                )}
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Cash Flow Report Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Reporte de Cobros</CardTitle>
                    <CardDescription>Elige un rango de fechas para ver los pagos recibidos.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="cashflow-start-date">Fecha de Inicio</Label>
                        <Input id="cashflow-start-date" type="date" value={cashFlowStartDate} onChange={(e) => setCashFlowStartDate(e.target.value)} disabled={cashFlowReportLoading} />
                    </div>
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="cashflow-end-date">Fecha de Fin</Label>
                        <Input id="cashflow-end-date" type="date" value={cashFlowEndDate} onChange={(e) => setCashFlowEndDate(e.target.value)} disabled={cashFlowReportLoading} />
                    </div>
                    <Button onClick={handleGenerateCashFlowReport} disabled={cashFlowReportLoading} className="w-full sm:w-auto">
                        {cashFlowReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                        <span className="ml-2">Generar Reporte de Cobros</span>
                    </Button>
                </CardContent>
            </Card>

            {cashFlowReportLoading && (
                <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="mt-4 text-lg font-medium">Generando reporte de cobros...</p>
                </div>
            )}

            {filteredCashFlowData && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Total de Transacciones</CardTitle>
                                <CardDescription>Número de transacciones en el período y filtro aplicado.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{filteredCashFlowData.totalTransactionsCount}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Monto Total Recibido</CardTitle>
                                <CardDescription>Suma total de dinero que ingresó en el período y filtro aplicado.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-green-600">${formatCurrency(filteredCashFlowData.totalAmountReceived)}</p>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div>
                                    <CardTitle>Detalle de Cobros</CardTitle>
                                    <CardDescription>
                                        {cashFlowConceptFilter !== 'all' ? `Mostrando solo: ${cashFlowConceptFilter}` : 'Mostrando todos los conceptos.'}
                                    </CardDescription>
                                </div>
                                <div className='flex items-end gap-2'>
                                    {cashFlowConcepts.length > 1 && (
                                        <div className="grid gap-2 w-full sm:w-auto">
                                            <Label htmlFor="concept-filter">Filtrar por Concepto</Label>
                                            <Select value={cashFlowConceptFilter} onValueChange={setCashFlowConceptFilter}>
                                                <SelectTrigger id="concept-filter" className="w-full sm:w-[250px]">
                                                    <SelectValue placeholder="Seleccionar concepto" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {cashFlowConcepts.map(concept => (
                                                        <SelectItem key={concept} value={concept}>
                                                            {concept === 'all' ? 'Ver Todos los Conceptos' : concept}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                     <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={handleExportCashFlowCSV}><Download className="h-4 w-4 mr-2" />CSV</Button>
                                        <Button variant="outline" size="sm" onClick={handleExportCashFlowPDF}><Download className="h-4 w-4 mr-2" />PDF</Button>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px] text-center">#</TableHead>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Nro. Documento</TableHead>
                                        <TableHead>Concepto</TableHead>
                                        <TableHead className="text-right">Monto Recibido</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredCashFlowData.transactions.map((transaction, index) => (
                                        <TableRow key={transaction.id} onClick={() => handleRowClick(transaction.creditSaleId)} className="cursor-pointer">
                                            <TableCell className="text-muted-foreground font-mono text-xs text-center border-r">{index + 1}</TableCell>
                                            <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                                            <TableCell className="font-medium">{transaction.customerName}</TableCell>
                                            <TableCell>{transaction.invoiceNumber}</TableCell>
                                            <TableCell>{transaction.concept}</TableCell>
                                            <TableCell className="text-right text-green-600">${formatCurrency(transaction.amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell className="text-center font-bold">Total</TableCell>
                                        <TableCell className="font-bold">{filteredCashFlowData.totalTransactionsCount}</TableCell>
                                        <TableCell colSpan={3} className="text-right font-bold"></TableCell>
                                        <TableCell className="text-right font-bold text-green-600">${formatCurrency(filteredCashFlowData.totalAmountReceived)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Import History Section */}
            {!isRentalPlan && (
                <Card>
                    <CardHeader>
                        <CardTitle>Historial de Importaciones</CardTitle>
                        <CardDescription>Consulta los resultados de tus cargas masivas de datos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {importReportsLoading ? (
                            <div className="flex h-48 w-full flex-col items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="mt-4 text-muted-foreground">Cargando historial...</p>
                            </div>
                        ) : importReports.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha</TableHead>
                                        <TableHead>Archivo</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Procesados</TableHead>
                                        <TableHead>Omitidos</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {importReports.map(report => (
                                        <TableRow key={report.id}>
                                            <TableCell>{formatDate(report.reportDate, true)}</TableCell>
                                            <TableCell className="font-medium">{report.fileName}</TableCell>
                                            <TableCell>{report.importType}</TableCell>
                                            <TableCell className="text-green-600">{report.processed}</TableCell>
                                            <TableCell className="text-yellow-600">{report.skipped}</TableCell>
                                            <TableCell className="text-right">
                                                {report.errors.length > 0 && (
                                                    <Button variant="outline" size="sm" onClick={() => {
                                                        setSelectedErrors(report.errors);
                                                        setIsErrorDialogOpen(true);
                                                    }}>
                                                        <Eye className="h-4 w-4 mr-2" />
                                                        Ver Errores
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="flex h-48 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                                <History className="mx-auto h-12 w-12 text-muted-foreground" />
                                <p className="mt-4 text-lg font-medium">Sin Historial</p>
                                <p className="mt-2 text-sm text-muted-foreground">Aún no se han realizado importaciones masivas.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Dialog open={isErrorDialogOpwn} onOpenChange={setIsErrorDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Detalle de Errores de Importación</DialogTitle>
                        <DialogDescription>
                            Listado de errores encontrados durante el procesamiento del archivo.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto p-4 bg-muted/50 rounded-lg">
                        <ul className="space-y-2 text-sm">
                            {selectedErrors.map((error, index) => (
                                <li key={index} className="p-2 border-l-4 border-destructive bg-background rounded-r-md">
                                    {error}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button>Cerrar</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    );
}

export default function ReportsPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ReportsContent />
        </Suspense>
    );
}
