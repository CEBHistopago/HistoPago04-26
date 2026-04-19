'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Users, CheckCircle, XCircle, Building, Bot, Send, AlertTriangle, ShieldCheck, Globe, UserCheck, Key } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getVendors } from '@/ai/flows/get-vendors-flow';
import { runAutomatedCollections } from '@/ai/flows/run-collections-flow';
import { sendDailyReports } from '@/ai/flows/daily-reports-flow';
import { getPlatformStats } from '@/ai/flows/get-platform-stats-flow';

interface Stats {
  totalVendors: number;
  activeVendors: number;
  inactiveVendors: number;
  totalCustomers: number;
  registeredCustomersCount: number;
  totalRegisteredUsers: number;
  adminsCount: number;
}

export default function AdminDashboardPage() {
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({ 
    totalVendors: 0, 
    activeVendors: 0, 
    inactiveVendors: 0, 
    totalCustomers: 0,
    registeredCustomersCount: 0,
    totalRegisteredUsers: 0,
    adminsCount: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCollectionsRunning, setIsCollectionsRunning] = useState(false);
  const [isReportsRunning, setIsReportsRunning] = useState(false);
  const [taskErrors, setTaskErrors] = useState<string[]>([]);

  useEffect(() => {
    const fetchAndCalculateStats = async () => {
      setIsLoading(true);
      try {
        const [vendorList, platformStats] = await Promise.all([
            getVendors(),
            getPlatformStats()
        ]);
        
        const activeVendors = vendorList.filter(v => v.status === 'Activo').length;
        const inactiveVendors = vendorList.filter(v => v.status === 'Inactivo' || v.status === 'Suspendido').length;

        setStats({ 
            totalVendors: platformStats.vendorsCount, 
            activeVendors, 
            inactiveVendors, 
            totalCustomers: platformStats.customersCount,
            registeredCustomersCount: platformStats.registeredCustomersCount,
            totalRegisteredUsers: platformStats.totalUsers,
            adminsCount: platformStats.adminsCount
        });

      } catch (error) {
        console.error("Error fetching stats:", error);
        toast({
          variant: 'destructive',
          title: 'Error al Cargar Estadísticas',
          description: 'No se pudieron obtener los datos del panel.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndCalculateStats();
  }, [toast]);

  const handleRunCollections = async () => {
    setIsCollectionsRunning(true);
    setTaskErrors([]);
    toast({ title: 'Iniciando proceso de recordatorios a clientes...' });
    try {
        const result = await runAutomatedCollections();
        toast({
            title: 'Proceso de Cobranza Ejecutado',
            description: `Se enviaron ${result.remindersSent} recordatorios. Errores: ${result.errors.length}.`,
        });
        if (result.errors.length > 0) {
            setTaskErrors(result.errors);
        }
    } catch (error: any) {
         toast({
          variant: 'destructive',
          title: 'Error al Ejecutar Proceso de Cobranza',
          description: error.message || 'Ocurrió un error inesperado.',
        });
    } finally {
        setIsCollectionsRunning(false);
    }
  };

  const handleRunReports = async () => {
    setIsReportsRunning(true);
    setTaskErrors([]);
    toast({ title: 'Iniciando envío de reportes diarios a comercios...' });
    try {
        const result = await sendDailyReports();
        
        if (result.vendorsScanned === 0) {
             toast({
                variant: 'default',
                title: 'No se encontraron comercios configurados',
                description: 'Asegúrate de que al menos un comercio tenga la opción de "Reporte Diario" activada en su perfil.',
            });
        } else if (result.reportsGenerated === 0) {
             toast({
                title: 'Proceso de Reportes Finalizado',
                description: `Se revisaron ${result.vendorsScanned} comercios, pero no se encontraron cuotas vencidas o por vencer hoy.`,
            });
        }
        else {
            toast({
                title: 'Proceso de Reportes Exitoso',
                description: `Se generaron ${result.reportsGenerated} reportes y se enviaron ${result.emailsSent} correos. Errores: ${result.errors.length}.`,
            });
        }
        
        if (result.errors.length > 0) {
            setTaskErrors(result.errors);
        }
    } catch (error: any) {
         toast({
          variant: 'destructive',
          title: 'Error Crítico al Ejecutar Reportes',
          description: error.message || 'Ocurrió un error inesperado en el flujo.',
        });
    } finally {
        setIsReportsRunning(false);
    }
  };


  if (isLoading) {
    return (
        <div className="flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-lg font-medium">Cargando estadísticas globales...</p>
        </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
       <Card>
          <CardHeader>
            <CardTitle>Panel de Administración Global</CardTitle>
            <CardDescription>
                Resumen de cuentas activas y métricas de la plataforma HistoPago.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-bold text-primary">Usuarios con Acceso</CardTitle>
                    <Key className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold text-primary">{stats.totalRegisteredUsers}</div>
                    <p className="text-xs text-primary/70">Cuentas con email y login.</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total de Comercios</CardTitle>
                    <Building className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalVendors}</div>
                    <p className="text-xs text-muted-foreground">Comercios registrados.</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Perfiles de Clientes</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalCustomers}</div>
                    <p className="text-xs text-muted-foreground">Base de datos de deuda total.</p>
                </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-bold text-green-700">Clientes Registrados</CardTitle>
                    <UserCheck className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-bold text-green-700">{stats.registeredCustomersCount}</div>
                    <p className="text-xs text-green-600/80">Clientes con cuenta activa.</p>
                </CardContent>
            </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Suscripciones Activas</CardTitle>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats.activeVendors}</div>
                    <p className="text-xs text-muted-foreground">Comercios operando actualmente.</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Suscripciones Inactivas</CardTitle>
                    <XCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats.inactiveVendors}</div>
                    <p className="text-xs text-muted-foreground">Cuentas vencidas o suspendidas.</p>
                </CardContent>
            </Card>
        </div>

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot /> Acciones del Sistema</CardTitle>
                <CardDescription>
                    Ejecución manual de procesos programados.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col items-start gap-2 rounded-lg border p-4">
                    <h3 className="font-semibold">Reportes Diarios a Comercios</h3>
                    <p className="text-sm text-muted-foreground">
                        Envía resúmenes de deuda a los comercios con esta opción activa.
                    </p>
                    <Button onClick={handleRunReports} disabled={isReportsRunning} className="mt-auto">
                        {isReportsRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Ejecutar Envío
                    </Button>
                </div>
                 <div className="flex flex-col items-start gap-2 rounded-lg border p-4">
                    <h3 className="font-semibold">Recordatorios a Clientes</h3>
                    <p className="text-sm text-muted-foreground">
                        Dispara los avisos de cobranza automáticos por correo y SMS.
                    </p>
                    <Button onClick={handleRunCollections} disabled={isCollectionsRunning} className="mt-auto">
                        {isCollectionsRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        Ejecutar Cobranza
                    </Button>
                </div>
            </CardContent>
        </Card>

        {taskErrors.length > 0 && (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Se encontraron {taskErrors.length} errores durante la ejecución</AlertTitle>
                <AlertDescription>
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                        {taskErrors.map((error, index) => (
                            <li key={index}>{error}</li>
                        ))}
                    </ul>
                </AlertDescription>
            </Alert>
        )}
    </div>
  );
}
