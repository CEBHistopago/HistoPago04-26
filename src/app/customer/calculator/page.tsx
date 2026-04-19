'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, PieChart, Info } from 'lucide-react';
import { getCustomerHistory } from '@/ai/flows/customer-history-flow';
import type { Customer, GetCustomerHistoryOutput } from '@/lib/data';
import { Bar, BarChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay } from 'date-fns';

export default function CalculatorPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [customerProfile, setCustomerProfile] = useState<Customer | null>(null);
  const [historyResult, setHistoryResult] = useState<GetCustomerHistoryOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthlyIncome, setMonthlyIncome] = useState<number | string>('');
  const [fixedExpenses, setFixedExpenses] = useState<number | string>('');
  
  useEffect(() => {
    async function fetchData() {
        if (isUserLoading) return;
        if (!user) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            // 1. Fetch Customer Profile
            const customerRef = doc(firestore, 'customers', user.uid);
            const docSnap = await getDoc(customerRef);
            if (!docSnap.exists()) {
                throw new Error("No se pudo encontrar tu perfil de cliente.");
            }
            const profile = docSnap.data() as Customer;
            setCustomerProfile(profile);

            // 2. Fetch Customer History
            const historyData = await getCustomerHistory({ customerIdentification: profile.identificationNumber });
            setHistoryResult(historyData);

        } catch (err: any) {
            console.error("Error fetching data for calculator:", err);
            setError(err.message || 'Ocurrió un error al cargar los datos.');
        } finally {
            setIsLoading(false);
        }
    }

    fetchData();
  }, [user, isUserLoading, firestore]);

  const histoPagoPaymentsThisMonth = useMemo(() => {
    if (!historyResult?.paymentSchedule) return 0;

    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    return historyResult.paymentSchedule.reduce((total, installment) => {
        const dueDate = parseISO(installment.dueDate);
        // Condition 1: The installment is overdue.
        if (installment.status === 'Vencido') {
            return total + installment.amount;
        }

        // Condition 2: The installment is pending AND its due date is within the current month.
        if (installment.status === 'Pendiente' && isWithinInterval(dueDate, { start, end })) {
            return total + installment.amount;
        }

        return total;
    }, 0);
  }, [historyResult]);
  
  const income = Number(monthlyIncome) || 0;
  const expenses = Number(fixedExpenses) || 0;
  
  const availableBalance = income - expenses - histoPagoPaymentsThisMonth;

  const chartData = [
    { name: 'Gastos Fijos', value: expenses, fill: 'hsl(var(--muted-foreground) / 0.5)' },
    { name: 'Pagos HistoPago', value: histoPagoPaymentsThisMonth, fill: 'hsl(var(--destructive) / 0.7)' },
    { name: 'Disponible', value: Math.max(0, availableBalance), fill: 'hsl(var(--primary) / 0.7)' },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-lg font-medium">Cargando datos para la calculadora...</p>
      </div>
    );
  }

  if (error) {
     return (
        <Card className="bg-red-50 border-red-200">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                    <CardTitle className="text-red-800">Error al Cargar</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="text-red-700">
                {error}
            </CardContent>
        </Card>
    );
  }

  return (
    <div className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Calculadora Financiera Personal</CardTitle>
                <CardDescription>
                Una herramienta simple para estimar tu presupuesto mensual.
                </CardDescription>
            </CardHeader>
        </Card>
      
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Tus Finanzas del Mes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="income">Ingreso Mensual Estimado</Label>
                            <Input 
                                id="income" 
                                type="number" 
                                placeholder="Ej: 1200.00" 
                                value={monthlyIncome}
                                onChange={(e) => setMonthlyIncome(e.target.value)}
                            />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="expenses">Gastos Fijos Mensuales</Label>
                            <Input 
                                id="expenses" 
                                type="number" 
                                placeholder="Ej: 500.00" 
                                value={fixedExpenses}
                                onChange={(e) => setFixedExpenses(e.target.value)}
                            />
                             <p className="text-xs text-muted-foreground">Suma de alquiler, servicios, comida, etc.</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="histopago">Pagos de HistoPago (Este Mes)</Label>
                            <Input 
                                id="histopago" 
                                type="number" 
                                value={histoPagoPaymentsThisMonth.toFixed(2)} 
                                readOnly 
                                className="font-bold bg-muted"
                            />
                             <p className="text-xs text-muted-foreground">Suma de cuotas pendientes y vencidas.</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-blue-50 border-blue-200">
                    <CardHeader className="flex flex-row items-start gap-4">
                        <Info className="h-5 w-5 text-blue-600 mt-1" />
                        <div>
                            <CardTitle className="text-blue-900 text-base">Herramienta Informativa</CardTitle>
                            <CardDescription className="text-blue-800">
                                Los datos que ingresas aquí son privados, se guardan solo en tu navegador y no afectan tu puntaje crediticio.
                            </CardDescription>
                        </div>
                    </CardHeader>
                </Card>
            </div>
            <div className="lg:col-span-2">
                <Card className="h-full flex flex-col">
                    <CardHeader>
                        <CardTitle>Resultado Estimado</CardTitle>
                        <CardDescription>
                            Una visualización de cómo se distribuyen tus gastos este mes.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-center items-center gap-4">
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground">Saldo Disponible Estimado</p>
                            <p className={`text-5xl font-bold ${availableBalance < 0 ? 'text-destructive' : 'text-primary'}`}>
                                ${availableBalance.toFixed(2)}
                            </p>
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                                <XAxis type="number" hide />
                                <YAxis type="category" dataKey="name" hide />
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                            {payload[0].payload.name}
                                                        </span>
                                                        <span className="font-bold text-muted-foreground">
                                                            ${(payload[0].value as number).toFixed(2)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="value" stackId="a" radius={[5, 5, 5, 5]} background={{ fill: '#eee', radius: 5 }} />
                            </BarChart>
                        </ResponsiveContainer>
                         <div className="flex flex-wrap justify-center gap-4 text-xs">
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'hsl(var(--muted-foreground) / 0.5)' }}/>
                                Gastos Fijos
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'hsl(var(--destructive) / 0.7)' }}/>
                                Pagos HistoPago
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary) / 0.7)' }}/>
                                Disponible
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter>
                         <p className="text-xs text-muted-foreground text-center w-full">
                            Recuerda, esto es solo una simulación basada en los datos que proporcionaste.
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    </div>
  );
}
