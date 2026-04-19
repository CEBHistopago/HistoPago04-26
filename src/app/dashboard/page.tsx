'use client';

import {
  DollarSign,
  Users,
  CreditCard,
  Loader2,
  Archive,
  Hourglass,
  ShieldCheck,
  TrendingDown,
  Send,
  CalendarCheck,
  Mail,
  MessageSquare,
  Bell,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableFooter, TableHeader, TableHead } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { SalesChart } from './sales-chart';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import type { CreditSale, DashboardStats, CollectionSummary } from '@/lib/data';
import { getDashboardStats } from '@/ai/flows/dashboard-stats-flow';
import { getCollectionSummary } from '@/ai/flows/get-collection-summary-flow';
import { useToast } from '@/hooks/use-toast';
import { getPendingPaymentsForVendor } from '@/ai/flows/pending-payments-flow';
import { getCollectionManagementStats } from '@/ai/flows/get-collection-management-stats-flow';
import { cn, formatCurrency } from '@/lib/utils';

// --- GAUGE NEEDLE HELPER ---
const RADIAN = Math.PI / 180;
const needle = (value: number, cx: number, cy: number, iR: number, oR: number, color: string) => {
  const ang = 180.0 * (1 - value / 100);
  const length = (iR + 2 * oR) / 3;
  const sin = Math.sin(-RADIAN * ang);
  const cos = Math.cos(-RADIAN * ang);
  const r = 6;
  const x0 = cx;
  const y0 = cy;
  const xba = cx + r * sin;
  const yba = cy - r * cos;
  const xbb = cx - r * sin;
  const ybb = cy + r * cos;
  const xp = cx + length * cos;
  const yp = cy + length * sin;

  return [
    <circle key="needle-dot" cx={cx} cy={cy} r={r} fill={color} stroke="none" />,
    <path key="needle-line" d={`M${xba} ${yba}L${xbb} ${ybb}L${xp} ${yp}L${xba} ${yba}`} stroke="none" fill={color} />,
  ];
};

function DelinquencyGauge({ rate, count }: { rate: number; count: number }) {
    const data = [
      { name: 'Normal', value: 15, color: '#22c55e' }, // 0-15% Green
      { name: 'Alert', value: 25, color: '#eab308' },  // 15-40% Yellow/Orange
      { name: 'Critical', value: 60, color: '#ef4444' }, // 40-100% Red
    ];

    const cx = 150;
    const cy = 140;
    const iR = 75;
    const oR = 110;

    const clampedRate = Math.min(Math.max(rate, 0), 100);

    const getStatusText = (v: number) => {
        if (v <= 15) return { text: 'Saludable', color: 'text-green-600' };
        if (v <= 40) return { text: 'Alerta', color: 'text-yellow-600' };
        return { text: 'Crítica', color: 'text-red-600' };
    };

    const status = getStatusText(clampedRate);

    return (
        <div className="flex flex-col items-center justify-center w-full pt-2">
            <div className="relative w-[300px] h-[230px] flex justify-center">
                <div className="h-[180px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                            <Pie
                                dataKey="value"
                                startAngle={180}
                                endAngle={0}
                                data={[{ value: 100 }]}
                                cx={cx}
                                cy={cy}
                                innerRadius={iR}
                                outerRadius={oR}
                                fill="#f3f4f6"
                                stroke="#e5e7eb"
                                strokeWidth={1}
                                isAnimationActive={false}
                            />
                            <Pie
                                dataKey="value"
                                startAngle={180}
                                endAngle={0}
                                data={data}
                                cx={cx}
                                cy={cy}
                                innerRadius={iR}
                                outerRadius={oR}
                                stroke="none"
                                paddingAngle={2}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} opacity={0.9} />
                                ))}
                            </Pie>
                            {needle(clampedRate, cx, cy, iR, oR, '#1f2937')}
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                
                {/* Texto centralizado exactamente bajo el eje de la aguja */}
                <div className="absolute top-[145px] left-0 right-0 flex flex-col items-center text-center">
                    <span className="text-4xl font-black tracking-tighter leading-none">{rate.toFixed(1)}%</span>
                    <span className={cn("text-xs font-bold uppercase tracking-widest mt-1", status.color)}>
                        {status.text}
                    </span>
                    <div className="mt-4 px-3 py-1 bg-muted rounded-full text-[10px] font-bold text-muted-foreground border uppercase tracking-tighter shadow-sm">
                        {count} {count === 1 ? 'Crédito en mora' : 'Créditos en mora'}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CollectionSummaryCard({ summary, isLoading }: { summary: CollectionSummary | null, isLoading: boolean }) {
    if (isLoading) {
        return (
            <Card className="lg:col-span-2 flex items-center justify-center h-full min-h-[250px]">
                <Loader2 className="h-8 w-8 animate-spin" />
            </Card>
        );
    }

    if (!summary) {
        return (
            <Card className="lg:col-span-2 flex flex-col items-center justify-center text-center p-6 h-full min-h-[250px]">
                 <CalendarCheck className="h-10 w-10 text-muted-foreground" />
                 <p className="mt-4 font-medium">No hay datos de cobranza</p>
                 <p className="text-sm text-muted-foreground">No se encontraron cuotas programadas para los próximos meses.</p>
            </Card>
        );
    }
    
    const { previousMonth, currentMonth, nextMonth } = summary;

    const MonthDetail = ({ data, title }: { data: typeof currentMonth, title: string }) => {
        const percentage = data.toCollect > 0 ? (data.collected / data.toCollect) * 100 : 0;
        return (
            <div className="space-y-2">
                <h4 className="font-semibold text-sm">{title} - <span className="text-muted-foreground">{data.period}</span></h4>
                <Progress value={percentage} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Cobrado: <span className="font-bold text-foreground">${formatCurrency(data.collected)}</span></span>
                    <span>Por Cobrar: <span className="font-bold text-foreground">${formatCurrency(data.toCollect)}</span></span>
                </div>
            </div>
        );
    };

    return (
        <Card className="lg:col-span-2 flex flex-col">
            <CardHeader>
                <CardTitle>Resumen de Cobranza Mensual</CardTitle>
                <CardDescription>Comparativo de lo que debes cobrar vs. lo que has cobrado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 flex-1">
                <MonthDetail data={previousMonth} title="Mes Anterior" />
                <MonthDetail data={currentMonth} title="Mes Actual" />
                <MonthDetail data={nextMonth} title="Mes Próximo" />
            </CardContent>
        </Card>
    );
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [collectionSummary, setCollectionSummary] = useState<CollectionSummary | null>(null);
  const [mgmtStats, setMgmtStats] = useState<any>(null);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const salesQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(
      collection(firestore, 'vendors', user.uid, 'sales'),
      orderBy('saleDate', 'desc')
    );
  }, [user, firestore]);

  const { data: sales, isLoading: salesLoading } = useCollection<CreditSale>(salesQuery);
    
  useEffect(() => {
    if (userLoading || !user) {
        if (!userLoading) {
            setStatsLoading(false);
        }
        return;
    };

    const fetchAllData = async () => {
        setStatsLoading(true);
        
        getDashboardStats(user.uid)
            .then(setStats)
            .catch(e => console.error("Error en stats principales:", e));

        getPendingPaymentsForVendor(user.uid)
            .then(res => setPendingPaymentsCount(res.length))
            .catch(e => console.error("Error en pagos pendientes:", e));

        getCollectionSummary({ vendorId: user.uid })
            .then(setCollectionSummary)
            .catch(e => console.error("Error en resumen mensual:", e));

        getCollectionManagementStats(user.uid)
            .then(setMgmtStats)
            .catch(e => console.error("Error en estadísticas de gestión:", e));

        setTimeout(() => setStatsLoading(false), 500);
    }
    
    fetchAllData();
  }, [user, userLoading]);

  const isVendorDataLoading = userLoading || salesLoading || statsLoading;

  if (isVendorDataLoading && !stats && !mgmtStats) {
      return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const safeStats = stats || {
    totalRevenue: 0,
    activeCredits: 0,
    totalSales: 0,
    overdueCount: 0,
    totalReceivableToDate: 0,
    pendingConfirmationCount: 0,
    vendorPlan: 'HistoGestion',
    totalClients: 0,
  };

  const safeMgmt = mgmtStats || {
    today: { whatsapp: 0, sms: 0, email: 0, push: 0, clientsContacted: 0 },
    thisMonth: { whatsapp: 0, sms: 0, email: 0, push: 0, clientsContacted: 0 }
  };
  
  const delinquencyRate = safeStats.activeCredits > 0 ? (safeStats.overdueCount / safeStats.activeCredits) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${formatCurrency(safeStats.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">Suma de todas tus ventas confirmadas.</p>
          </CardContent>
        </Card>
        <Link href="/dashboard/reports?autorun=aging" className="transition-all hover:scale-[1.02] hover:shadow-md">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cuentas por Cobrar</CardTitle>
                <Archive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">${formatCurrency(safeStats.totalReceivableToDate)}</div>
                <p className="text-xs text-muted-foreground">Total de cuotas vencidas.</p>
              </CardContent>
            </Card>
        </Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{safeStats.vendorPlan === 'HistoAlquiler' ? 'Contratos Activos' : 'Créditos Activos'}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{safeStats.activeCredits}</div>
            <p className="text-xs text-muted-foreground">{safeStats.vendorPlan === 'HistoAlquiler' ? 'Contratos con saldo pendiente.' : 'Créditos con saldo pendiente.'}</p>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{safeStats.totalClients}</div>
            <p className="text-xs text-muted-foreground">Número total de clientes únicos.</p>
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/payment-verification" className="transition-all hover:scale-[1.02] hover:shadow-md">
            <Card className='bg-blue-50 border-blue-200 h-full'>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-800">Pagos por Verificar</CardTitle>
                <ShieldCheck className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-800">{pendingPaymentsCount}</div>
                <p className="text-xs text-blue-700">Pagos reportados por clientes.</p>
              </CardContent>
            </Card>
        </Link>
        <Link href="/dashboard/sales" className="transition-all hover:scale-[1.02] hover:shadow-md">
            <Card className='bg-amber-50 border-amber-200 h-full'>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-800">Ventas por Confirmar</CardTitle>
                <Hourglass className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-800">+{safeStats.pendingConfirmationCount}</div>
                <p className="text-xs text-amber-700">Ventas esperando acción del cliente.</p>
              </CardContent>
            </Card>
        </Link>
        <CollectionSummaryCard summary={collectionSummary} isLoading={isVendorDataLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Gestión de Cobranza</CardTitle>
            <CardDescription>Resumen de notificaciones automáticas y manuales.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
             <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Canal</TableHead>
                        <TableHead className="text-center w-[100px]">Hoy</TableHead>
                        <TableHead className="text-center w-[100px]">Este Mes</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableRow>
                        <TableCell><div className="flex items-center gap-2"><MessageSquare className="text-green-500 h-4 w-4" /> WhatsApp</div></TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.today.whatsapp}</TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.thisMonth.whatsapp}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell><div className="flex items-center gap-2"><Send className="text-blue-500 h-4 w-4" /> SMS</div></TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.today.sms}</TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.thisMonth.sms}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell><div className="flex items-center gap-2"><Mail className="text-orange-500 h-4 w-4" /> Email</div></TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.today.email}</TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.thisMonth.email}</TableCell>
                    </TableRow>
                     <TableRow>
                        <TableCell><div className="flex items-center gap-2"><Bell className="text-purple-500 h-4 w-4" /> Push</div></TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.today.push}</TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.thisMonth.push}</TableCell>
                    </TableRow>
                </TableBody>
                <TableFooter>
                    <TableRow>
                        <TableCell className="font-semibold">Clientes Contactados</TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.today.clientsContacted}</TableCell>
                        <TableCell className="text-center font-bold">{safeMgmt.thisMonth.clientsContacted}</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Salud de la Cartera</CardTitle>
                    <CardDescription>Indicador dinámico de morosidad.</CardDescription>
                </div>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center flex-1">
                <DelinquencyGauge rate={delinquencyRate} count={safeStats.overdueCount} />
                <p className="text-center text-xs text-muted-foreground mt-4 px-4 max-w-[320px]">
                    Refleja el porcentaje de créditos activos que presentan al menos una cuota vencida según el cronograma.
                </p>
            </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <SalesChart salesData={sales ?? []} />
      </div>
    </div>
  );
}
