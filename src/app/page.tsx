
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { Logo } from '@/components/logo';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between border-b px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo className="h-10 w-auto" />
        </Link>
        <div className="flex items-center gap-4">
          <Button asChild>
            <Link href="/login">Iniciar Sesión</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none">
                    La forma inteligente de gestionar tus créditos y cobranzas.
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    HistoPago centraliza tu historial de pagos, automatiza la cobranza y te ofrece una visión clara de tu salud financiera.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="lg" asChild>
                    <Link href="/signup">
                      Registro para Comercios
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                   <Button size="lg" variant="secondary" asChild>
                    <Link href="/signup-rental">
                      Registro para Alquileres
                    </Link>
                  </Button>
                   <Button size="lg" variant="outline" asChild>
                    <Link href="/signup-customer">
                      Registro para Clientes
                    </Link>
                  </Button>
                </div>
              </div>
               <div className="flex items-center justify-center">
                 <Logo className="h-auto w-full max-w-[400px]" />
               </div>
            </div>
          </div>
        </section>

        <section className="w-full bg-muted py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">
                  Beneficios Clave
                </div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Todo lo que necesitas, en un solo lugar.
                </h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Tanto para comercios que otorgan créditos como para clientes que necesitan un historial confiable.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:grid-cols-3 lg:gap-16 mt-12">
              <div className="grid gap-1">
                <h3 className="text-lg font-bold">Gestión de Créditos</h3>
                <p className="text-sm text-muted-foreground">
                  Registra y administra fácilmente todas tus ventas a crédito. Visualiza saldos pendientes, fechas de vencimiento y más.
                </p>
              </div>
              <div className="grid gap-1">
                <h3 className="text-lg font-bold">Automatización de Cobranza</h3>
                <p className="text-sm text-muted-foreground">
                  Envía recordatorios automáticos de pago a tus clientes por correo y SMS, mejorando tu flujo de caja.
                </p>
              </div>
              <div className="grid gap-1">
                <h3 className="text-lg font-bold">Historial Crediticio Unificado</h3>
                <p className="text-sm text-muted-foreground">
                  Como cliente, consulta todo tu historial de pagos en un solo lugar y obtén un reporte certificado de tu comportamiento.
                </p>
              </div>
               <div className="grid gap-1">
                <h3 className="text-lg font-bold">Reportes Inteligentes</h3>
                <p className="text-sm text-muted-foreground">
                  Genera reportes de ventas, cuentas por cobrar y flujo de caja para tomar decisiones informadas.
                </p>
              </div>
               <div className="grid gap-1">
                <h3 className="text-lg font-bold">Verificación de Clientes</h3>
                <p className="text-sm text-muted-foreground">
                  Consulta el HistoPuntaje de un cliente antes de otorgar un nuevo crédito para minimizar riesgos.
                </p>
              </div>
               <div className="grid gap-1">
                <h3 className="text-lg font-bold">Carga Masiva de Datos</h3>
                <p className="text-sm text-muted-foreground">
                  Importa tus ventas y pagos existentes de forma masiva utilizando nuestras plantillas CSV.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} HistoPago. Todos los derechos reservados.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link href="/terms" className="text-xs hover:underline underline-offset-4">
            Términos y Condiciones
          </Link>
        </nav>
      </footer>
    </div>
  );
}
