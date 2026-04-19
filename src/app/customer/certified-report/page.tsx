'use client';

import { useState, useEffect } from 'react';
import { Loader2, ShieldCheck, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getCustomerHistory } from '@/ai/flows/customer-history-flow';
import type { Customer, GetCustomerHistoryOutput, CreditSaleWithPayments, Payment } from '@/lib/data';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { Logo } from '@/components/logo';

export default function CertifiedReportPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [customerProfile, setCustomerProfile] = useState<Customer | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const REPORT_COST = 1.00; // Updated cost

    useEffect(() => {
        async function fetchProfile() {
            if (isUserLoading || !user || !firestore) {
                if (!isUserLoading) setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const customerRef = doc(firestore, 'customers', user.uid);
                const docSnap = await getDoc(customerRef);
                if (!docSnap.exists()) {
                    throw new Error("No se pudo encontrar tu perfil de cliente.");
                }
                setCustomerProfile(docSnap.data() as Customer);
            } catch (err: any) {
                setError(err.message || 'Ocurrió un error al cargar tus datos.');
            } finally {
                setIsLoading(false);
            }
        }
        fetchProfile();
    }, [user, isUserLoading, firestore]);
    
    const formatDate = (dateStr: string) => format(parseISO(dateStr), 'dd/MM/yyyy');
    
    const generatePDF = (historyData: GetCustomerHistoryOutput) => {
        const doc = new jsPDF();
        const customer = customerProfile;
        if (!customer) return;

        // Generate unique serial number for the report
        const reportSerial = `HP-${customer.identificationNumber}-${Date.now()}`;
        
        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('HistoPago', 14, 22);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Reporte de Crédito Certificado', 14, 30);
        
        doc.setLineWidth(0.5);
        doc.line(14, 35, 196, 35);

        // Customer Info & Report ID
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Información del Cliente', 14, 45);
        (doc as any).autoTable({
            startY: 48,
            theme: 'plain',
            body: [
                ['Nombre:', customer.name],
                ['Identificación:', customer.identificationNumber],
                ['Correo Electrónico:', customer.email],
                ['Fecha de Emisión:', format(new Date(), 'dd/MM/yyyy HH:mm')],
                ['Número de Reporte:', reportSerial], // Added serial number
            ],
            styles: { fontSize: 10 },
            columnStyles: { 0: { fontStyle: 'bold' } }
        });

        // Credit Score
        const scoreY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Resumen Crediticio', 14, scoreY);
        (doc as any).autoTable({
            startY: scoreY + 3,
            theme: 'striped',
            head: [['HistoPuntos', 'Créditos Activos', 'Créditos Pagados', 'Créditos Vencidos', 'Deuda Total']],
            body: [[
                `${historyData.stats.creditScore.toFixed(1)} / 20`,
                historyData.stats.activeCredits,
                historyData.stats.paidCredits,
                historyData.stats.overdueCredits,
                `$${historyData.stats.totalDebt.toFixed(2)}`
            ]],
            headStyles: { fillColor: [31, 41, 55] },
            bodyStyles: { fontStyle: 'bold', halign: 'center' }
        });

        // Detailed History
        let finalY = (doc as any).lastAutoTable.finalY;
        for (const sale of historyData.history) {
            if (sale.status === 'Pendiente de Confirmación') continue;

            finalY = (doc as any).lastAutoTable.finalY + 15;
            
            // Section for each credit
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`Crédito con ${sale.vendorName || 'Comercio Desconocido'} (Factura: ${sale.invoiceNumber})`, 14, finalY);

            (doc as any).autoTable({
                 startY: finalY + 3,
                 theme: 'grid',
                 head: [['Fecha Venta', 'Monto Total', 'Cuotas', 'Saldo Actual', 'Estado']],
                 body: [[
                     formatDate(sale.saleDate),
                     `$${sale.amount.toFixed(2)}`,
                     `${sale.paidInstallments || 0}/${sale.numberOfInstallments}`,
                     `$${(sale.remainingBalance || 0).toFixed(2)}`,
                     sale.status
                 ]],
                 headStyles: { fillColor: [100, 116, 139] }, // slate-500
            });
            
            // Payment History for the credit
             if (sale.payments && sale.payments.length > 0) {
                 (doc as any).autoTable({
                    startY: (doc as any).lastAutoTable.finalY + 2,
                    head: [['Fecha de Pago', 'Monto', 'Método', 'Referencia', 'Estado']],
                    body: sale.payments.map((p: Payment) => [
                        formatDate(p.paymentDate),
                        `$${p.amount.toFixed(2)}`,
                        p.paymentMethod,
                        p.referenceNumber || 'N/A',
                        p.status
                    ]),
                    styles: { fontSize: 8 },
                    headStyles: { fillColor: [203, 213, 225] }, // slate-300
                });
             }
        }
        
        // Footer
        const pageCount = (doc as any).internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 25, doc.internal.pageSize.getHeight() - 10);
            doc.text('HistoPago - Reporte de Crédito Certificado', 14, doc.internal.pageSize.getHeight() - 10);
        }

        doc.save(`histopago-reporte-${customer.identificationNumber}.pdf`);
    };

    const handleRequestReport = async () => {
        if (!customerProfile) {
            setError('No se pudo encontrar la información del cliente para generar el reporte.');
            return;
        }

        setIsGenerating(true);
        try {
            const historyData = await getCustomerHistory({ customerIdentification: customerProfile.identificationNumber });
            generatePDF(historyData);
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error al generar el reporte.');
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-lg font-medium">Cargando...</p>
            </div>
        );
    }

    if (error) {
        return (
            <Card className="bg-red-50 border-red-200">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                        <CardTitle className="text-red-800">Error</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="text-red-700">{error}</CardContent>
            </Card>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <Card>
                <CardHeader className="text-center">
                    <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
                    <CardTitle className="text-2xl mt-4">Reporte de Crédito Certificado</CardTitle>
                    <CardDescription>
                        Obtén un documento oficial en PDF con todo tu historial crediticio en la plataforma de HistoPago.
                        Este documento es ideal para presentarlo como referencia financiera.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-6">
                    <div className="bg-muted/50 rounded-lg p-4">
                        <p className="text-muted-foreground">Costo del Reporte</p>
                        <p className="text-3xl font-bold">${REPORT_COST.toFixed(2)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Por el momento, la generación es gratuita como beneficio de lanzamiento.
                        En el futuro, este proceso requerirá un pago.
                    </p>
                    <Button 
                        size="lg" 
                        className="w-full" 
                        onClick={handleRequestReport} 
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generando Reporte...
                            </>
                        ) : (
                             <>
                                <Download className="mr-2 h-4 w-4" />
                                Solicitar y Descargar Reporte
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
