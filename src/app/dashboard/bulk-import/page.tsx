'use client';

import { useState } from 'react';
import { useUser } from '@/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileDown, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import Papa from 'papaparse';
import { processBulkSales } from '@/ai/flows/bulk-sales-flow';
import { processBulkPayments } from '@/ai/flows/bulk-payments-flow';
import { format } from 'date-fns';

type ProcessResult = {
    processed: number;
    skipped: number;
    errors: string[];
};

export default function BulkImportPage() {
    const { user } = useUser();
    const { toast } = useToast();
    
    // Sales state
    const [salesFile, setSalesFile] = useState<File | null>(null);
    const [isProcessingSales, setIsProcessingSales] = useState(false);
    const [salesResult, setSalesResult] = useState<ProcessResult | null>(null);
    
    // Payments state
    const [paymentsFile, setPaymentsFile] = useState<File | null>(null);
    const [isProcessingPayments, setIsProcessingPayments] = useState(false);
    const [paymentsResult, setPaymentsResult] = useState<ProcessResult | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'sales' | 'payments') => {
        if (e.target.files && e.target.files[0]) {
            if (type === 'sales') {
                setSalesFile(e.target.files[0]);
                setSalesResult(null);
            } else {
                setPaymentsFile(e.target.files[0]);
                setPaymentsResult(null);
            }
        }
    };

    const downloadTemplate = (type: 'sales' | 'payments') => {
        let headers, data, filename;
        const dateString = format(new Date(), 'yyyy-MM-dd');

        if (type === 'sales') {
            headers = [
                'Nombre Cliente', 
                'Prefijo ID', 
                'Numero ID', 
                'Correo Cliente', 
                'Prefijo Telefono', 
                'Numero Telefono', 
                'Tipo Cliente', 
                'Tipo Credito', 
                'Vendedor / Asesor',
                'Numero Factura', 
                'Items', 
                'Monto', 
                'Tipo Inicial', 
                'Valor Inicial', 
                'Numero Cuotas', 
                'Frecuencia Pago', 
                'Fecha Venta', 
                'Fecha Primer Pago'
            ];
            data = [[
                'Juan Perez', 
                'V', 
                '12345678', 
                'juan.perez@email.com', 
                '412', 
                '1234567', 
                'Persona Natural', 
                'Compra al Credito', 
                'Andres Asesor',
                'FACT-001', 
                '1x Producto A, 2x Producto B', 
                '150.50', 
                'Monto Fijo', 
                '50.50', 
                '2', 
                'Quincenal', 
                '2024-07-25', 
                '2024-08-10'
            ]];
            filename = `plantilla_ventas_${dateString}.csv`;
        } else {
            headers = ['Numero Factura', 'Identificacion Cliente', 'Monto', 'Fecha Pago', 'Metodo Pago', 'Numero Referencia'];
            data = [['FACT-001', 'V-12345678', '50.00', '2024-08-10', 'Transferencia', 'REF12345']];
            filename = `plantilla_pagos_${dateString}.csv`;
        }

        const csv = Papa.unparse({
             fields: headers,
             data: data,
        });

        const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleProcessFile = async (type: 'sales' | 'payments') => {
        const file = type === 'sales' ? salesFile : paymentsFile;
        if (!file || !user) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Por favor, selecciona un archivo y asegúrate de haber iniciado sesión.',
            });
            return;
        }

        if (type === 'sales') setIsProcessingSales(true);
        else setIsProcessingPayments(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => {
                const normalizedHeader = header.trim().replace(/\s+/g, '').replace(/\//g, '').toLowerCase();
                const headerMapping: { [key: string]: string } = {
                    'nombrecliente': 'customerName',
                    'prefijoid': 'idPrefix',
                    'numeroid': 'idNumber',
                    'correocliente': 'customerEmail',
                    'prefijotelefono': 'phonePrefix',
                    'numerotelefono': 'phoneNumber',
                    'tipocliente': 'customerType',
                    'tipocredito': 'creditType',
                    'vendedorasesor': 'salesPerson',
                    'numerofactura': 'invoiceNumber',
                    'items': 'items',
                    'monto': 'amount',
                    'tipoinicial': 'downPaymentType',
                    'valorinicial': 'downPaymentValue',
                    'numerocuotas': 'numberOfInstallments',
                    'frecuenciapago': 'paymentFrequency',
                    'fechaventa': 'saleDate',
                    'fechaprimerpago': 'firstPaymentDate',
                    'identificacioncliente': 'customerIdentification',
                    'fechapago': 'paymentDate',
                    'metodopago': 'paymentMethod',
                    'numeroreferencia': 'referenceNumber'
                };
                return headerMapping[normalizedHeader] || header.trim();
            },
            complete: async (results) => {
                const data = results.data;
                try {
                    let result;
                    if (type === 'sales') {
                        result = await processBulkSales({ vendorId: user.uid, salesData: data, fileName: file.name });
                        setSalesResult(result);
                    } else {
                        result = await processBulkPayments({ vendorId: user.uid, paymentsData: data, fileName: file.name });
                        setPaymentsResult(result);
                    }
                    toast({
                        title: 'Proceso Completado',
                        description: `Se procesaron ${result.processed} registros y se omitieron ${result.skipped}. Revisa la página de reportes para ver el historial.`,
                    });
                } catch (error: any) {
                    console.error(`Error procesando archivo de ${type}:`, error);
                    toast({
                        variant: 'destructive',
                        title: 'Error en el Procesamiento',
                        description: error.message || `No se pudo procesar el archivo de ${type}.`,
                    });
                } finally {
                    if (type === 'sales') {
                        setIsProcessingSales(false);
                        setSalesFile(null);
                    }
                    else {
                        setIsProcessingPayments(false);
                        setPaymentsFile(null);
                    }
                }
            },
            error: (error: any) => {
                console.error(`Error al leer el archivo de ${type}:`, error);
                toast({
                    variant: 'destructive',
                    title: 'Error de Lectura',
                    description: 'No se pudo leer el archivo. Asegúrate de que sea un CSV válido con codificación UTF-8.',
                });
                if (type === 'sales') setIsProcessingSales(false);
                else setIsProcessingPayments(false);
            },
        });
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold">Carga Masiva de Datos</h1>
                <p className="text-muted-foreground">Importa tus ventas a crédito y pagos de forma rápida usando plantillas CSV.</p>
            </div>

            <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>¡Importante!</AlertTitle>
                <AlertDescription>
                    Para evitar errores de acentos o caracteres especiales, asegúrate de guardar tu archivo CSV con codificación <strong>UTF-8</strong>. 
                    Si usas Excel, ve a `Archivo {'>'} Guardar como` y selecciona `CSV UTF-8 (delimitado por comas)`.
                </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Importar Nuevas Ventas</CardTitle>
                        <CardDescription>Sube un archivo CSV con la información de tus ventas a crédito.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button variant="outline" onClick={() => downloadTemplate('sales')}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Descargar Plantilla de Ventas
                        </Button>
                        <div className="space-y-2">
                            <Label htmlFor="sales-file">Archivo CSV de Ventas</Label>
                            <Input id="sales-file" type="file" accept=".csv" onChange={(e) => handleFileChange(e, 'sales')} disabled={isProcessingSales} key={salesFile ? 'sales-loaded' : 'sales-empty'}/>
                        </div>
                        <Button onClick={() => handleProcessFile('sales')} disabled={!salesFile || isProcessingSales} className="w-full">
                            {isProcessingSales ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            {isProcessingSales ? 'Procesando Ventas...' : 'Procesar Ventas'}
                        </Button>
                        {salesResult && (
                             <div className="mt-4 rounded-lg border p-4">
                                <h4 className="font-semibold mb-2">Resultados del último procesamiento:</h4>
                                <div className="flex items-center gap-2 text-green-600">
                                    <CheckCircle className="h-4 w-4"/> 
                                    <span>{salesResult.processed} registros procesados exitosamente.</span>
                                </div>
                                <div className="flex items-center gap-2 text-yellow-600 mt-1">
                                    <XCircle className="h-4 w-4"/> 
                                    <span>{salesResult.skipped} registros omitidos.</span>
                                </div>
                                {salesResult.errors.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-sm font-medium text-destructive">Errores encontrados:</p>
                                        <ul className="list-disc pl-5 text-xs text-destructive max-h-40 overflow-y-auto">
                                            {salesResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Importar Pagos</CardTitle>
                        <CardDescription>Sube un archivo CSV con los pagos recibidos de tus clientes.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <Button variant="outline" onClick={() => downloadTemplate('payments')}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Descargar Plantilla de Pagos
                        </Button>
                         <div className="space-y-2">
                            <Label htmlFor="payments-file">Archivo CSV de Pagos</Label>
                            <Input id="payments-file" type="file" accept=".csv" onChange={(e) => handleFileChange(e, 'payments')} disabled={isProcessingPayments} key={paymentsFile ? 'payments-loaded' : 'payments-empty'}/>
                        </div>
                        <Button onClick={() => handleProcessFile('payments')} disabled={!paymentsFile || isProcessingPayments} className="w-full">
                            {isProcessingPayments ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                            {isProcessingPayments ? 'Procesando Pagos...' : 'Procesar Pagos'}
                        </Button>
                        {paymentsResult && (
                             <div className="mt-4 rounded-lg border p-4">
                                <h4 className="font-semibold mb-2">Resultados del último procesamiento:</h4>
                                <div className="flex items-center gap-2 text-green-600">
                                    <CheckCircle className="h-4 w-4"/> 
                                    <span>{paymentsResult.processed} pagos procesados exitosamente.</span>
                                </div>
                                <div className="flex items-center gap-2 text-yellow-600 mt-1">
                                    <XCircle className="h-4 w-4"/> 
                                    <span>{paymentsResult.skipped} pagos omitidos.</span>
                                </div>
                                {paymentsResult.errors.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-sm font-medium text-destructive">Errores encontrados:</p>
                                        <ul className="list-disc pl-5 text-xs text-destructive max-h-40 overflow-y-auto">
                                            {paymentsResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
