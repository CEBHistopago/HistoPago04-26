'use client';

import { useState, useMemo } from 'react';
import { Loader2, Search, FileText, AlertCircle, ShieldCheck, CheckCircle, XCircle, HelpCircle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getCustomerHistory } from '@/ai/flows/customer-history-flow';
import { findCustomerGlobally } from '@/ai/flows/find-customer-globally-flow';
import type { GetCustomerHistoryOutput, CreditSaleWithPayments, FindCustomerGloballyOutput } from '@/lib/data';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const idPrefixes = ["V", "E", "J", "G"];


function ScoreCard({ score, name, id }: { score: number, name: string, id: string }) {
    const getColor = () => {
        if (score <= 9) return 'text-red-500';
        if (score <= 13) return 'text-orange-500';
        if (score <= 17) return 'text-yellow-500';
        return 'text-green-500';
    };

    const getRecommendation = () => {
         if (score === 11.5 && name === 'Cliente no Encontrado') return { text: 'Sin Historial', icon: <HelpCircle className="h-4 w-4" /> };
         if (score <= 9) return { text: 'Muy Riesgoso', icon: <XCircle className="h-4 w-4" /> };
         if (score <= 13) return { text: 'Riesgo Medio', icon: <AlertCircle className="h-4 w-4" /> };
         if (score <= 17) return { text: 'Normal', icon: <CheckCircle className="h-4 w-4" /> };
         if (score >= 18) return { text: 'HistoSafe!', icon: <ShieldCheck className="h-4 w-4" /> };
         return { text: 'Normal', icon: <CheckCircle className="h-4 w-4" /> };
    }
    
    const recommendation = getRecommendation();

    return (
        <Card className="flex flex-col items-center justify-center p-6 text-center">
            <CardTitle className="text-lg font-semibold">{name}</CardTitle>
            <CardDescription>{id}</CardDescription>
            <p className="text-sm font-medium text-muted-foreground mt-4">HistoPuntos</p>
            <p className={`text-6xl font-bold ${getColor()}`}>{score.toFixed(1)}<span className="text-4xl text-muted-foreground">/20</span></p>
            <div className="flex items-center gap-2 mt-2">
                {recommendation.icon}
                <p className="text-sm font-semibold">{recommendation.text}</p>
            </div>
        </Card>
    );
}

function StatCard({ title, value, colorClass }: { title: string, value: string, colorClass?: string }) {
    return (
        <Card>
            <CardHeader className="items-center p-4 text-center">
                <CardTitle className={cn("text-sm font-medium", colorClass)}>{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-2 text-center">
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
    );
}

function HistoryTable({ history }: { history: CreditSaleWithPayments[] }) {
    const formatDate = (date: any) => {
        if (!date) return 'N/A';
        try {
            const d = parseISO(date); // Timestamps from flow are already ISO strings
            return format(d, 'dd/MM/yyyy');
        } catch (error) {
            return 'Fecha inválida';
        }
    };

    const statusColors: { [key: string]: string } = {
        Pagado: 'bg-green-100 text-green-800',
        Pendiente: 'bg-yellow-100 text-yellow-800',
        Vencido: 'bg-red-100 text-red-800',
        'Pendiente de Confirmación': 'bg-blue-100 text-blue-800'
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Historial de Compromisos</CardTitle>
                <CardDescription>Detalle de todos los compromisos del cliente en la plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tipo de Compromiso</TableHead>
                                <TableHead>Fecha Venta</TableHead>
                                <TableHead>Fecha Venc.</TableHead>
                                <TableHead className="text-center">Cuotas Pagadas</TableHead>
                                <TableHead className="text-center">Cuotas Pendientes</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.map(sale => (
                                <TableRow key={sale.id}>
                                    <TableCell className="font-medium">{sale.creditType}</TableCell>
                                    <TableCell>{formatDate(sale.saleDate)}</TableCell>
                                    <TableCell>{formatDate(sale.dueDate)}</TableCell>
                                    <TableCell className="text-center font-medium text-green-600">{sale.paidInstallments || 0}</TableCell>
                                    <TableCell className="text-center font-medium text-red-600">{sale.pendingInstallments || 0}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge className={cn(statusColors[sale.status ?? 'Pendiente'])}>
                                            {sale.status}
                                        </Badge>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
}

export default function VerificationPage() {
  const [idPrefix, setIdPrefix] = useState('V');
  const [idNumber, setIdNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [customerInfo, setCustomerInfo] = useState<FindCustomerGloballyOutput | null>(null);
  const [historyResult, setHistoryResult] = useState<GetCustomerHistoryOutput | null>(null);

  const [hasSearched, setHasSearched] = useState(false);
  const [searchedId, setSearchedId] = useState('');

  const handleSearch = async () => {
    if (!idPrefix || !idNumber) {
        setError('Por favor, introduce un prefijo y número de identificación.');
        return;
    }
    setLoading(true);
    setHistoryResult(null); // Clear previous history
    setCustomerInfo(null);
    setError(null);
    setHasSearched(true);
    
    const fullId = `${idPrefix}-${idNumber}`;
    setSearchedId(fullId);
    
    try {
        const info = await findCustomerGlobally({ customerIdentification: fullId });
        setCustomerInfo(info);
        
        if (info) {
            // If customer is found, immediately fetch their history
            const history = await getCustomerHistory({ customerIdentification: fullId });
            setHistoryResult(history);
        } else {
            // If customer not found, we will show a specific message later.
            setHistoryResult(null); 
        }
    } catch (err: any) {
        console.error("Error finding customer or history:", err);
        setError(err.message || 'Ocurrió un error inesperado al buscar.');
        setCustomerInfo(null);
        setHistoryResult(null);
    } finally {
        setLoading(false);
    }
  };
  
  const customerName = customerInfo ? customerInfo.customerName : 'Cliente no Encontrado';
  const finalScore = historyResult ? historyResult.stats.creditScore : 11.5;

  return (
    <div className="grid gap-6">
        <div className="flex items-center justify-between">
            <div>
                <h1 className="text-2xl font-bold">Verificación de Cliente</h1>
                <p className="text-muted-foreground">
                    Consulta la información y el historial crediticio de un cliente.
                </p>
            </div>
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Buscar Cliente</CardTitle>
                <CardDescription>Introduce el número de identificación del cliente para ver su información.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex w-full max-w-md items-center space-x-2">
                    <Select value={idPrefix} onValueChange={setIdPrefix} disabled={loading}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="Prefijo" />
                        </SelectTrigger>
                        <SelectContent>
                        {idPrefixes.map(prefix => (
                            <SelectItem key={prefix} value={prefix}>{prefix}-</SelectItem>
                        ))}
                        </SelectContent>
                    </Select>
                    <Input
                        type="text"
                        placeholder="Número de Identificación"
                        value={idNumber}
                        onChange={(e) => setIdNumber(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        disabled={loading}
                    />
                    <Button onClick={handleSearch} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        <span className="ml-2">Buscar</span>
                    </Button>
                </div>
            </CardContent>
        </Card>

        {loading && (
            <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-4 text-lg font-medium">Buscando cliente...</p>
            </div>
        )}

        {error && (
            <Card className="bg-red-50 border-red-200">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-6 w-6 text-red-600" />
                        <CardTitle className="text-red-800">Error de Búsqueda</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="text-red-700">
                    {error}
                </CardContent>
            </Card>
        )}

        {hasSearched && !loading && !error && (
             customerInfo && historyResult ? (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="lg:col-span-1">
                             <ScoreCard score={finalScore} name={customerName} id={searchedId} />
                        </div>
                        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <StatCard title="Créditos Activos" value={`${historyResult.stats.activeCredits}`} colorClass="text-yellow-500" />
                            <StatCard title="Créditos Pagados" value={`${historyResult.stats.paidCredits}`} colorClass="text-blue-500" />
                            <StatCard title="Créditos Vencidos" value={`${historyResult.stats.overdueCredits}`} colorClass="text-red-500" />
                        </div>
                    </div>
                    {historyResult.history.length > 0 ? (
                        <HistoryTable history={historyResult.history} />
                    ) : (
                        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                            <p className="mt-4 text-lg font-medium">El cliente no tiene historial de crédito</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Este cliente está registrado pero aún no tiene créditos.
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <p className="mt-4 text-lg font-medium">EL CLIENTE NO SE ENCUENTRA REGISTRADO EN HISTOPAGO</p>
                </div>
            )
        )}
    </div>
  );
}
