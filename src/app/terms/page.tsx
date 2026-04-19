
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Logo } from '@/components/logo';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function TermsAndConditionsPage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-muted/40 p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-4xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/login">
            <Logo className="h-16 w-auto" />
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Términos y Condiciones de Uso
          </h1>
          <p className="mt-2 text-muted-foreground">
            Última actualización: 25 de Julio de 2024
          </p>
        </div>

        <Card className="text-sm">
          <CardHeader>
            <CardTitle>Bienvenido a HistoPago</CardTitle>
            <CardDescription>
              Lea atentamente estos términos antes de utilizar nuestros
              servicios. Al registrarse y utilizar la plataforma HistoPago, usted
              acepta estar sujeto a los siguientes términos y condiciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">1. Definiciones</h2>
              <p className="text-muted-foreground">
                <strong>Plataforma:</strong> Se refiere a la aplicación web HistoPago.<br />
                <strong>Comercio:</strong> Se refiere a cualquier persona o entidad que se registra para gestionar sus ventas, servicios, suscripciones, matrículas, o cualquier transacción comercial al crédito, sujetas a las leyes de la República Bolivariana de Venezuela, a través de la plataforma.<br />
                <strong>Cliente:</strong> Se refiere a cualquier persona natural o jurídica, que se registra para consultar su historial de pago o acepta un compromiso con un Comercio a través de la plataforma.
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">2. Objeto del Servicio</h2>
              <p className="text-muted-foreground">
                HistoPago es una plataforma que permite a los Comercios gestionar sus ventas, servicios, suscripciones, matrículas, o cualquier transacción comercial al crédito otorgadas a sus Clientes y permite a los Clientes consultar su historial de pago unificado a través de los diferentes Comercios afiliados. HistoPago no es una entidad financiera y no otorga créditos.
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">3. Obligaciones del Comercio</h2>
               <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                    <li>El Comercio es el único responsable de la veracidad y exactitud de la información de las ventas a crédito y los pagos que registra en la plataforma.</li>
                    <li>El Comercio se compromete a obtener el consentimiento explícito del Cliente antes de registrar una venta a crédito en HistoPago.</li>
                    <li>El Comercio es responsable de gestionar el cobro de las deudas y de actualizar el estado de los pagos en la plataforma de manera oportuna.</li>
                    <li>El uso indebido de la plataforma, incluyendo el registro de información falsa o con fines fraudulentos, resultará en la suspensión inmediata de la cuenta.</li>
                </ul>
            </div>
            
            <div className="space-y-2">
                <h2 className="text-lg font-semibold">4. Obligaciones del Cliente</h2>
                <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                    <li>El Cliente debe proporcionar información veraz durante el proceso de registro y verificación de identidad.</li>
                    <li>El Cliente entiende que al aceptar un crédito de un Comercio, dicho crédito y su historial de pagos asociado serán visibles para otros Comercios en la plataforma con el fin de evaluar su riesgo crediticio.</li>
                    <li>El Cliente es responsable de revisar y confirmar los nuevos compromisos de crédito registrados por los Comercios para activarlos en su historial.</li>
                </ul>
            </div>
            
             <div className="space-y-2">
                <h2 className="text-lg font-semibold">5. Seguridad y Privacidad de los Datos</h2>
                 <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                    <li><strong>Aislamiento de Datos:</strong> La información de cada Comercio es estrictamente confidencial y está separada de los demás. Ningún Comercio puede acceder a la información de otro.</li>
                    <li><strong>Acceso Controlado:</strong> El acceso a la plataforma está protegido por credenciales de inicio de sesión individuales. El Cliente solo puede ver su propia información. El Comercio solo puede gestionar sus propias ventas y clientes.</li>
                    <li><strong>Encriptación:</strong> Toda la información viaja desde su navegador a nuestros servidores de forma encriptada (usando HTTPS/TLS), garantizando que no pueda ser interceptada. Además, los datos se almacenan de forma encriptada en nuestros servidores.</li>
                    <li><strong>Almacenamiento Seguro y Cifrado:</strong> Utilizamos la infraestructura de Google Cloud para almacenar los datos. Toda la información se cifra automáticamente antes de guardarse en disco (cifrado en reposo), lo que significa que es ilegible para cualquiera que no tenga las claves de acceso adecuadas, las cuales son gestionadas de forma segura por Google.</li>
                    <li><strong>Uso del Historial Crediticio:</strong> De acuerdo con lo aceptado por el Cliente, su historial de pagos se utiliza para calcular un puntaje de crédito (HistoPuntaje). Este puntaje, junto con el historial de comportamiento de pago (sin detalles específicos de las compras), es visible para otros Comercios registrados con el único fin de facilitar la evaluación para futuros créditos.</li>
                    <li><strong>Transparencia y Consentimiento:</strong> Los datos de un Cliente solo se registran en la plataforma con su consentimiento previo, al aceptar un crédito o registrarse directamente.</li>
                </ul>
            </div>

            <div className="space-y-2">
                <h2 className="text-lg font-semibold">6. Limitación de Responsabilidad</h2>
                <p className="text-muted-foreground">
                   HistoPago actúa como un intermediario tecnológico y no se hace responsable de las disputas, incumplimientos de pago o acuerdos entre el Comercio y el Cliente. La plataforma proporciona una herramienta para la gestión de la información, pero la relación crediticia es exclusiva entre el Comercio y el Cliente.
                </p>
            </div>
            
            <div className="space-y-2">
                <h2 className="text-lg font-semibold">7. Modificaciones de los Términos</h2>
                <p className="text-muted-foreground">
                    HistoPago se reserva el derecho de modificar estos términos y condiciones en cualquier momento. Se notificará a los usuarios sobre cambios importantes. El uso continuado de la plataforma después de dichas modificaciones constituirá su aceptación de los nuevos términos.
                </p>
            </div>

            <div className="pt-6 text-center">
              <Button asChild>
                <Link href="/login">Volver a Inicio</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
