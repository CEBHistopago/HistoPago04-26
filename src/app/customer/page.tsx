'use client';

import { useState, useEffect, useMemo } from 'react';
import { Loader2, FileText, AlertCircle, ShieldCheck, CheckCircle, XCircle, HelpCircle, CalendarClock, Hourglass } from 'lucide-react';
import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import Link from 'next/link';
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
import { getCustomerHistory } from '@/ai/flows/customer-history-flow';
import type { GetCustomerHistoryOutput, Customer, Installment } from '@/lib/data';
import { cn } from '@/lib/utils';
import { format, isToday, isWithinInterval, startOfMonth, endOfMonth, addDays, startOfDay, parseISO } from 'date-fns';
import { CustomerPurchasesChart } from './purchases-chart';

// This component will be rendered inside the main page component
function CustomerDashboard({ customerProfile }: { customerProfile: Customer }) {
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GetCustomerHistoryOutput | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!customerProfile?.identificationNumber) {
        setLoadingHistory(false);
        return;
      }
      setLoadingHistory(true);
      setError(null);
      try {
        const history = await getCustomerHistory({ customerIdentification: customerProfile.identificationNumber });
        setResult(history);
      } catch (err: any) {
        console.error("Error fetching customer history:", err);
        setError(err.message || 'Ocurrió un error inesperado al buscar tu historial.');
      } finally {
        setLoadingHistory(false);
      }
    };
    
    fetchHistory();
    
    // Set up an interval to re-fetch data periodically, e.g., every minute
    const intervalId = setInterval(fetchHistory, 60000);

    return () => clearInterval(intervalId);

  }, [customerProfile]);

  if (loadingHistory) {
      return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Actualizando tu resumen de cuenta...</p>
        </div>
      )
  }

  if (error) {
    return (
        <Card className="bg-red-50 border-red-200">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                    <CardTitle className="text-red-800">Error al Cargar Resumen</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="text-red-700">
                {error}
            </CardContent>
        </Card>
    );
  }

  if (!result) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No se pudo cargar tu historial</p>
            <p className="mt-2 text-sm text-muted-foreground">Ocurrió un problema al buscar tus datos. Intenta de nuevo más tarde.</p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Resumen de Cuenta</CardTitle>
                <CardDescription>Tu estado crediticio y resumen de actividad en la plataforma.</CardDescription>
            </CardHeader>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-1">
                 <ScoreCard 
                    score={result.stats.creditScore} 
                    name={customerProfile.name || ''} 
                    id={customerProfile.identificationNumber || ''} 
                />
            </div>
            <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                 {result.stats.pendingConfirmationCount > 0 && (
                    <Link href="/customer/commitments" className="transition-all hover:scale-[1.02] hover:shadow-md md:col-span-1">
                        <Card className='bg-blue-50 border-blue-200 h-full'>
                            <CardHeader className="items-center p-4 text-center">
                                <CardTitle className="text-sm font-medium text-blue-800">Por Confirmar</CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 text-center">
                                <div className="text-2xl font-bold text-blue-800 flex items-center justify-center gap-2">
                                    <Hourglass className="h-5 w-5" />
                                    <span>{result.stats.pendingConfirmationCount}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                )}
                 {result.stats.pendingVerificationCount > 0 && (
                    <Link href="/customer/commitments" className="transition-all hover:scale-[1.02] hover:shadow-md md:col-span-1">
                        <Card className='bg-purple-50 border-purple-200 h-full'>
                            <CardHeader className="items-center p-4 text-center">
                                <CardTitle className="text-sm font-medium text-purple-800">Pagos en Verificación</CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 text-center">
                                <div className="text-2xl font-bold text-purple-800 flex items-center justify-center gap-2">
                                    <Hourglass className="h-5 w-5" />
                                    <span>{result.stats.pendingVerificationCount}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                )}
                <StatCard title="Créditos Activos" value={`${result.stats.activeCredits}`} colorClass="text-yellow-500" />
                <StatCard title="Créditos Pagados" value={`${result.stats.paidCredits}`} colorClass="text-blue-500" />
                <StatCard title="Créditos Vencidos" value={`${result.stats.overdueCredits}`} colorClass="text-red-500" />
            </div>
        </div>

        {result.paymentSchedule && result.paymentSchedule.length > 0 ? (
            <PaymentCalendar schedule={result.paymentSchedule} />
        ) : (
             <Card>
                <CardHeader>
                    <CardTitle>Cronograma de Pagos</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg">
                        <CheckCircle className="h-10 w-10 text-green-500" />
                        <p className="mt-4 text-lg font-medium">¡Estás al día!</p>
                        <p className="text-sm text-muted-foreground">No tienes pagos pendientes o próximos.</p>
                    </div>
                </CardContent>
            </Card>
        )}

        {result.history && result.history.length > 0 ? (
          <CustomerPurchasesChart salesData={result.history} />
        ) : (
            <Card>
                <CardHeader>
                    <CardTitle>Resumen de Compras</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg">
                        <FileText className="h-10 w-10 text-muted-foreground" />
                        <p className="mt-4 text-lg font-medium">Sin historial de compras</p>
                        <p className="text-sm text-muted-foreground">Cuando realices tu primera compra a crédito, aparecerá aquí.</p>
                    </div>
                </CardContent>
            </Card>
        )}
    </div>
  );
}


function ScoreCard({ score, name, id }: { score: number, name: string, id: string }) {
    const getColor = () => {
        if (score <= 9) return 'text-red-500';
        if (score <= 13) return 'text-orange-500';
        if (score <= 17) return 'text-yellow-500';
        return 'text-green-500';
    };

    const getRecommendation = () => {
         if (score === 0 && !name) return { text: 'Sin Historial', icon: <HelpCircle className="h-4 w-4" /> };
         if (score <= 9) return { text: 'Muy Riesgoso', icon: <XCircle className="h-4 w-4" /> };
         if (score <= 13) return { text: 'Riesgo Medio', icon: <AlertCircle className="h-4 w-4" /> };
         if (score <= 17) return { text: 'Normal', icon: <CheckCircle className="h-4 w-4" /> };
         if (score >= 18) return { text: 'HistoSafe!', icon: <ShieldCheck className="h-4 w-4" /> };
         return { text: 'Normal', icon: <CheckCircle className="h-4 w-4" /> };
    }
    
    const recommendation = getRecommendation();

    return (
        <Card className="flex flex-col items-center justify-center p-6 text-center h-full">
            <CardTitle className="text-lg font-semibold">{name || "Bienvenido"}</CardTitle>
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

function PaymentCalendar({ schedule }: { schedule: Installment[] }) {
    const [filter, setFilter] = useState('today');

    const formatDate = (dateString: string) => {
        if (!dateString) return 'N/A';
        try {
            // Dates from the flow are ISO strings
            const d = parseISO(dateString);
            return format(d, 'dd/MM/yyyy');
        } catch {
            return "Fecha Inválida";
        }
    };

    const statusColors: { [key: string]: string } = {
        Pendiente: 'text-yellow-600',
        Vencido: 'text-red-600',
    };
    
    const filteredSchedule = useMemo(() => {
        const now = startOfDay(new Date());

        const isOverdue = (dueDate: Date) => dueDate < now;

        const getFiltered = () => {
            switch (filter) {
                case 'today':
                    return schedule.filter(item => isToday(parseISO(item.dueDate)) || isOverdue(parseISO(item.dueDate)));
                case '7days':
                    return schedule.filter(item => isWithinInterval(parseISO(item.dueDate), { start: now, end: addDays(now, 7) }) || isOverdue(parseISO(item.dueDate)));
                case '15days':
                     return schedule.filter(item => isWithinInterval(parseISO(item.dueDate), { start: now, end: addDays(now, 15) }) || isOverdue(parseISO(item.dueDate)));
                case 'thisMonth':
                     return schedule.filter(item => isWithinInterval(parseISO(item.dueDate), { start: now, end: endOfMonth(now) }) || isOverdue(parseISO(item.dueDate)));
                case 'all':
                default:
                    return schedule;
            }
        };

        const result = getFiltered();
        return result.sort((a, b) => {
            if (a.status === 'Vencido' && b.status !== 'Vencido') return -1;
            if (a.status !== 'Vencido' && b.status === 'Vencido') return 1;
            return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
        });

    }, [schedule, filter]);


    if (schedule.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Cronograma de Pagos</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg">
                        <CheckCircle className="h-10 w-10 text-green-500" />
                        <p className="mt-4 text-lg font-medium">¡Estás al día!</p>
                        <p className="text-sm text-muted-foreground">No tienes pagos pendientes o próximos.</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between">
                <div>
                    <CardTitle>Cronograma de Pagos</CardTitle>
                    <CardDescription>Tus próximos pagos y cuotas vencidas.</CardDescription>
                </div>
                <div className="flex items-center gap-2 pt-4 md:pt-0">
                    <Select value={filter} onValueChange={setFilter}>
                        <SelectTrigger className="w-full md:w-[180px]">
                            <SelectValue placeholder="Filtrar por..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Ver Todos</SelectItem>
                            <SelectItem value="today">Hoy</SelectItem>
                            <SelectItem value="7days">Próximos 7 días</SelectItem>
                            <SelectItem value="15days">Próximos 15 días</SelectItem>
                            <SelectItem value="thisMonth">Este Mes</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                 <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha Vencimiento</TableHead>
                                <TableHead>Comercio</TableHead>
                                <TableHead>Monto Pendiente</TableHead>
                                <TableHead className="text-right">Estado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSchedule.map(item => (
                                <TableRow key={`${item.saleId}-${item.installmentNumber}`}>
                                    <TableCell className="font-medium">{formatDate(item.dueDate)}</TableCell>
                                    <TableCell>{item.vendorName}</TableCell>
                                    <TableCell>${item.amount.toFixed(2)}</TableCell>
                                    <TableCell className={cn("text-right font-semibold", statusColors[item.status])}>
                                        {item.status}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                {filteredSchedule.length === 0 && (
                     <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed rounded-lg mt-4">
                        <CheckCircle className="h-10 w-10 text-green-500" />
                        <p className="mt-4 text-lg font-medium">¡Sin cuotas en este rango!</p>
                        <p className="text-sm text-muted-foreground">No tienes pagos que coincidan con el filtro seleccionado.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function CustomerDashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const customerProfileRef = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return doc(firestore, 'customers', user.uid);
  }, [user, firestore]);

  const { data: customerProfile, isLoading: isProfileLoading } = useDoc<Customer>(customerProfileRef);

  const finalIsLoading = isUserLoading || isProfileLoading;

  if (finalIsLoading) {
      return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Cargando tu resumen de cuenta...</p>
        </div>
      )
  }

  if (!customerProfile) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">Perfil de cliente no encontrado</p>
            <p className="mt-2 text-sm text-muted-foreground">No pudimos cargar tu información de perfil.</p>
        </div>
    );
  }

  return <CustomerDashboard customerProfile={customerProfile} />;
}
