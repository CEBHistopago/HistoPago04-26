'use client';

import { useState } from 'react';
import { Loader2, DollarSign, Users, Filter, Download } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    TableFooter,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getSubscriptionRevenue, getNewSubscribers, getSubscribersByStatus } from '@/ai/flows/admin-reports-flow';
import type { SubscriptionPayment, Vendor } from '@/lib/data';
import { format, parseISO } from 'date-fns';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';


interface RevenueReport {
    payments: (SubscriptionPayment & { vendorName?: string })[];
    totalAmount: number;
}

interface SubscribersReport {
    vendors: Vendor[];
}

export default function AdminReportsPage() {
    const { toast } = useToast();
    
    // State for Subscription Revenue Report
    const [revenueStartDate, setRevenueStartDate] = useState('');
    const [revenueEndDate, setRevenueEndDate] = useState('');
    const [revenueReportLoading, setRevenueReportLoading] = useState(false);
    const [revenueReport, setRevenueReport] = useState<RevenueReport | null>(null);

    // State for New Subscribers Report
    const [subsStartDate, setSubsStartDate] = useState('');
    const [subsEndDate, setSubsEndDate] = useState('');
    const [subsReportLoading, setSubsReportLoading] = useState(false);
    const [newSubsReport, setNewSubsReport] = useState<SubscribersReport | null>(null);

    // State for Subscription Status Report
    const [subsStatus, setSubsStatus] = useState('Activo');
    const [subsStatusReportLoading, setSubsStatusReportLoading] = useState(false);
    const [statusReport, setStatusReport] = useState<SubscribersReport | null>(null);
    
    const formatDate = (date: any, includeTime = false) => {
        if (!date) return 'N/A';
        try {
            const d = typeof date === 'string' ? parseISO(date) : date;
            const formatString = includeTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy';
            return format(d, formatString);
        } catch {
            return 'Fecha Inválida';
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

    const handleGenerateRevenueReport = async () => {
        if (!revenueStartDate || !revenueEndDate) {
            toast({ variant: 'destructive', title: 'Fechas requeridas', description: 'Por favor, selecciona un rango de fechas.' });
            return;
        }
        setRevenueReportLoading(true);
        setRevenueReport(null);
        try {
            const result = await getSubscriptionRevenue({ startDate: revenueStartDate, endDate: revenueEndDate });
            setRevenueReport(result);
            if (result.payments.length === 0) {
                toast({ title: 'Sin resultados', description: 'No se encontraron ingresos en el período seleccionado.' });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al generar reporte', description: error.message });
        } finally {
            setRevenueReportLoading(false);
        }
    };

    const handleGenerateSubsReport = async () => {
        if (!subsStartDate || !subsEndDate) {
            toast({ variant: 'destructive', title: 'Fechas requeridas', description: 'Por favor, selecciona un rango de fechas.' });
            return;
        }
        setSubsReportLoading(true);
        setNewSubsReport(null);
        try {
            const result = await getNewSubscribers({ startDate: subsStartDate, endDate: subsEndDate });
            setNewSubsReport({ vendors: result });
            if (result.length === 0) {
                toast({ title: 'Sin resultados', description: 'No se encontraron nuevos suscriptores en el período seleccionado.' });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al generar reporte', description: error.message });
        } finally {
            setSubsReportLoading(false);
        }
    };

    const handleGenerateStatusReport = async () => {
        setSubsStatusReportLoading(true);
        setStatusReport(null);
        try {
            const result = await getSubscribersByStatus({ 
                status: subsStatus as any,
            });
            setStatusReport({ vendors: result });
             if (result.length === 0) {
                toast({ title: 'Sin resultados', description: `No se encontraron suscriptores con estado "${subsStatus}".` });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error al generar reporte', description: error.message });
        } finally {
            setSubsStatusReportLoading(false);
        }
    };

    // --- EXPORT FUNCTIONS ---

    const exportToCSV = (data: any[], headers: {key: string, label: string}[], fileName: string) => {
        const formattedData = data.map(item => {
            const row: any = {};
            headers.forEach(header => {
                row[header.label] = item[header.key];
            });
            return row;
        });
        const csv = Papa.unparse(formattedData);
        downloadFile(csv, `${fileName}.csv`, 'text/csv;charset=utf-8;');
    };

    const exportToPDF = (data: any[], headers: {key: string, label: string}[], fileName: string, title: string, totalLabel?: string, totalValue?: string) => {
        const doc = new jsPDF();
        doc.setFontSize(16).text(title, 14, 15);
        doc.setFontSize(10).text(`Generado: ${formatDate(new Date(), true)}`, 14, 22);
        
        const tableData = data.map(item => headers.map(header => item[header.key] ?? 'N/A'));
        const foot = (totalLabel && totalValue) ? [[{ content: totalLabel, colSpan: headers.length -1, styles: { halign: 'right', fontStyle: 'bold' } }, { content: totalValue, styles: { fontStyle: 'bold' } }]] : [];

        (doc as any).autoTable({
            startY: 30,
            head: [headers.map(h => h.label)],
            body: tableData,
            foot: foot
        });
        doc.save(`${fileName}.pdf`);
    };

    return (
        <div className="grid gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Reportes de Administrador</h1>
                    <p className="text-muted-foreground">Analiza la actividad y el rendimiento de la plataforma.</p>
                </div>
            </div>
            
            {/* Subscription Revenue Report Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Reporte de Ingresos por Suscripción</CardTitle>
                    <CardDescription>Elige un rango de fechas para ver los ingresos generados por las suscripciones de los comercios.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="start-date">Fecha de Inicio</Label>
                        <Input id="start-date" type="date" value={revenueStartDate} onChange={(e) => setRevenueStartDate(e.target.value)} disabled={revenueReportLoading} />
                    </div>
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="end-date">Fecha de Fin</Label>
                        <Input id="end-date" type="date" value={revenueEndDate} onChange={(e) => setRevenueEndDate(e.target.value)} disabled={revenueReportLoading}/>
                    </div>
                    <Button onClick={handleGenerateRevenueReport} disabled={revenueReportLoading} className="w-full sm:w-auto">
                        {revenueReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" /> }
                        <span className="ml-2">Generar Reporte de Ingresos</span>
                    </Button>
                </CardContent>
                {revenueReport && revenueReport.payments.length > 0 && (
                    <CardContent>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Resultados: {revenueReport.payments.length} pagos encontrados</h3>
                             <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => exportToCSV(revenueReport.payments.map(p => ({...p, amount: p.amount.toFixed(2), paymentDateFmt: formatDate(p.paymentDate), newExpiryDateFmt: formatDate(p.newExpiryDate)})), [{key: 'vendorName', label: 'Comercio'}, {key: 'paymentDateFmt', label: 'Fecha Pago'}, {key: 'amount', label: 'Monto'}, {key: 'monthsPaid', label: 'Meses'}, {key: 'newExpiryDateFmt', label: 'Nueva Expiración'}], 'reporte-ingresos')}> <Download className="mr-2 h-4 w-4" />CSV</Button>
                                <Button variant="outline" size="sm" onClick={() => exportToPDF(revenueReport.payments.map(p => ({...p, amount: p.amount.toFixed(2), paymentDateFmt: formatDate(p.paymentDate), newExpiryDateFmt: formatDate(p.newExpiryDate)})), [{key: 'vendorName', label: 'Comercio'}, {key: 'paymentDateFmt', label: 'Fecha Pago'}, {key: 'amount', label: 'Monto ($)'}, {key: 'monthsPaid', label: 'Meses'}, {key: 'newExpiryDateFmt', label: 'Expiración'}], 'reporte-ingresos', 'Reporte de Ingresos', 'Total', `$${revenueReport.totalAmount.toFixed(2)}`)}> <Download className="mr-2 h-4 w-4" />PDF</Button>
                            </div>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Comercio</TableHead>
                                    <TableHead>Fecha de Pago</TableHead>
                                    <TableHead>Monto</TableHead>
                                    <TableHead>Meses Pagados</TableHead>
                                    <TableHead>Nueva Expiración</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {revenueReport.payments.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell>{p.vendorName}</TableCell>
                                        <TableCell>{formatDate(p.paymentDate)}</TableCell>
                                        <TableCell>${p.amount.toFixed(2)}</TableCell>
                                        <TableCell>{p.monthsPaid}</TableCell>
                                        <TableCell>{formatDate(p.newExpiryDate)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={2} className="text-right font-bold">Total Ingresos</TableCell>
                                    <TableCell className="font-bold">${revenueReport.totalAmount.toFixed(2)}</TableCell>
                                    <TableCell colSpan={2}></TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                )}
            </Card>

            {/* New Subscribers Report Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Reporte de Crecimiento de Suscriptores</CardTitle>
                    <CardDescription>Analiza cuántos nuevos comercios se han registrado en un período determinado.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="subs-start-date">Fecha de Inicio</Label>
                        <Input id="subs-start-date" type="date" value={subsStartDate} onChange={(e) => setSubsStartDate(e.target.value)} disabled={subsReportLoading} />
                    </div>
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="subs-end-date">Fecha de Fin</Label>
                        <Input id="subs-end-date" type="date" value={subsEndDate} onChange={(e) => setSubsEndDate(e.target.value)} disabled={subsReportLoading}/>
                    </div>
                    <Button onClick={handleGenerateSubsReport} disabled={subsReportLoading} className="w-full sm:w-auto">
                        {subsReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" /> }
                        <span className="ml-2">Generar Reporte de Crecimiento</span>
                    </Button>
                </CardContent>
                 {newSubsReport && newSubsReport.vendors.length > 0 && (
                    <CardContent>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Resultados: {newSubsReport.vendors.length} nuevos suscriptores</h3>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => exportToCSV(newSubsReport.vendors.map(v => ({...v, creationDate: formatDate(v.creationDate)})), [{key: 'name', label: 'Nombre'}, {key: 'email', label: 'Email'}, {key: 'status', label: 'Estado Actual'}, {key: 'creationDate', label: 'Fecha Registro'}], 'reporte-nuevos-suscriptores')}> <Download className="mr-2 h-4 w-4" />CSV</Button>
                                <Button variant="outline" size="sm" onClick={() => exportToPDF(newSubsReport.vendors.map(v => ({...v, creationDate: formatDate(v.creationDate)})), [{key: 'name', label: 'Nombre'}, {key: 'email', label: 'Email'}, {key: 'status', label: 'Estado'}, {key: 'creationDate', label: 'Fecha Registro'}], 'reporte-nuevos-suscriptores', 'Reporte de Nuevos Suscriptores')}> <Download className="mr-2 h-4 w-4" />PDF</Button>
                            </div>
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre Comercio</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Estado Actual</TableHead>
                                    <TableHead>Fecha de Registro</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {newSubsReport.vendors.map(v => (
                                    <TableRow key={v.id}>
                                        <TableCell>{v.name}</TableCell>
                                        <TableCell>{v.email}</TableCell>
                                        <TableCell>{v.status}</TableCell>
                                        <TableCell>{formatDate(v.creationDate)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                )}
            </Card>

            {/* Subscription Status Report Section */}
            <Card>
                <CardHeader>
                    <CardTitle>Reporte de Suscriptores por Estado</CardTitle>
                    <CardDescription>Filtra los comercios según el estado actual de su suscripción.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 items-end">
                    <div className="grid gap-2 w-full sm:w-auto">
                        <Label htmlFor="status-select">Estado de Suscripción</Label>
                        <Select value={subsStatus} onValueChange={setSubsStatus} disabled={subsStatusReportLoading}>
                            <SelectTrigger id="status-select" className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Seleccionar estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Activo">Activo</SelectItem>
                                <SelectItem value="Inactivo">Inactivo</SelectItem>
                                <SelectItem value="Suspendido">Suspendido</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleGenerateStatusReport} disabled={subsStatusReportLoading} className="w-full sm:w-auto">
                        {subsStatusReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" /> }
                        <span className="ml-2">Generar Reporte por Estado</span>
                    </Button>
                </CardContent>
                {statusReport && statusReport.vendors.length > 0 && (
                     <CardContent>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Resultados: {statusReport.vendors.length} suscriptores con estado "{subsStatus}"</h3>
                             <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => exportToCSV(statusReport.vendors.map(v => ({...v, subscriptionEndDate: formatDate(v.subscriptionEndDate)})), [{key: 'name', label: 'Nombre'}, {key: 'email', label: 'Email'}, {key: 'subscriptionEndDate', label: 'Fecha Vencimiento'}], `reporte-estado-${subsStatus}`)}> <Download className="mr-2 h-4 w-4" />CSV</Button>
                                <Button variant="outline" size="sm" onClick={() => exportToPDF(statusReport.vendors.map(v => ({...v, subscriptionEndDate: formatDate(v.subscriptionEndDate)})), [{key: 'name', label: 'Nombre'}, {key: 'email', label: 'Email'}, {key: 'subscriptionEndDate', label: 'Fecha Vencimiento'}], `reporte-estado-${subsStatus}`, `Reporte Suscriptores - ${subsStatus}`)}> <Download className="mr-2 h-4 w-4" />PDF</Button>
                            </div>
                        </div>
                       <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nombre Comercio</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Fecha Vencimiento</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {statusReport.vendors.map(v => (
                                    <TableRow key={v.id}>
                                        <TableCell>{v.name}</TableCell>
                                        <TableCell>{v.email}</TableCell>
                                        <TableCell>{formatDate(v.subscriptionEndDate)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
