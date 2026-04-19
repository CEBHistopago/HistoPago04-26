'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

const CodeBlock = ({ code }: { code: string }) => (
  <pre className="mt-2 rounded-md bg-muted p-4 text-sm overflow-x-auto">
    <code>{code}</code>
  </pre>
);

export default function ApiDocsPage() {
  const saleRequestBody = `{
  "customerName": "John Doe",
  "idPrefix": "V",
  "idNumber": "12345678",
  "customerEmail": "john.doe@example.com",
  "phonePrefix": "412",
  "phoneNumber": "1234567",
  "customerType": "Persona Natural",
  "creditType": "Compra al Credito",
  "invoiceNumber": "FACT-2024-001",
  "items": "1x Laptop, 1x Mouse",
  "amount": 1250.50,
  "downPaymentType": "Monto Fijo",
  "downPaymentValue": 250.50,
  "numberOfInstallments": 10,
  "paymentFrequency": "Mensual",
  "saleDate": "2024-07-26",
  "firstPaymentDate": "2024-08-26"
}`;

  const paymentRequestBody = `{
  "invoiceNumber": "FACT-2024-001",
  "customerIdentification": "V-12345678",
  "payment": {
    "amount": 100.00,
    "paymentDate": "2024-08-26",
    "paymentMethod": "Transferencia",
    "referenceNumber": "REF-987654"
  }
}`;

  const customerPaymentRequestBody = `{
  "vendorId": "uid-del-comercio-al-que-se-paga",
  "saleId": "id-de-la-venta-especifica",
  "payment": {
    "amount": 100.00,
    "paymentDate": "2024-08-27",
    "paymentMethod": "Transferencia",
    "referenceNumber": "REF-ABCDE123"
  }
}`;

  const successResponse = `{
  "success": true,
  "message": "Venta creada exitosamente y lista para operar.",
  "id": "A4g...sKj"
}`;

  const errorResponse = `{
  "success": false,
  "message": "Invalid request body.",
  "errors": {
    "formErrors": [],
    "fieldErrors": {
      "amount": [
        "El monto debe ser un número positivo."
      ]
    }
  }
}`;
    
  const headerExample = `Authorization: Bearer sk_xxxxxxxxxxxxxxxxxxxxxxxx`;
  const baseUrlProduction = `https://<TU_DOMINIO_DE_PRODUCCION>/api/...`;
  const baseUrlLocal = `http://localhost:9002/api/...`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Documentación de la API</CardTitle>
          <CardDescription>
            Guía para integrar tus sistemas con la API de HistoPago y automatizar el registro de ventas y pagos.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Autenticación</CardTitle>
          <CardDescription>
            Todas las solicitudes a la API deben estar autenticadas. El método varía si la solicitud es para un comercio o para un cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h3 className="text-lg font-semibold">Para Comercios</h3>
          <p className="mb-2 text-sm">
            1. Un administrador debe generar tu API Key desde el panel de administración, en la sección de{' '}
            <Link href="/admin/vendors" className="font-medium text-primary underline">Gestión de Comercios</Link>,
            editando tu perfil.
          </p>
          <p className="mb-2 text-sm">
            2. Incluye esta llave en el encabezado <code className="font-mono text-sm bg-muted px-1 rounded">Authorization</code> de cada solicitud, con el prefijo <code className="font-mono text-sm bg-muted px-1 rounded">Bearer</code>.
          </p>
          <h4 className="font-semibold mt-4">Formato del Encabezado (Comercio):</h4>
          <CodeBlock code={headerExample} />

          <h3 className="text-lg font-semibold mt-6">Para Clientes</h3>
          <p className="mb-2 text-sm">
            La autenticación de clientes se realiza con un <strong>Firebase ID Token</strong>. El sistema cliente debe autenticar al usuario con Firebase (por ejemplo, usando la SDK de cliente de Firebase) y enviar el token de ID obtenido en el encabezado de autorización.
          </p>
          <h4 className="font-semibold mt-4">Formato del Encabezado (Cliente):</h4>
          <CodeBlock code={'Authorization: Bearer <FIREBASE_ID_TOKEN>'} />
        </CardContent>
      </Card>
      
       <Card>
        <CardHeader>
          <CardTitle>URL Base</CardTitle>
          <CardDescription>
            La URL completa a la que debes enviar las peticiones se compone de la URL base de tu aplicación seguida de la ruta del endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <h4 className="font-semibold">URL de Producción</h4>
            <CodeBlock code={baseUrlProduction} />
            <h4 className="mt-4 font-semibold">URL de Desarrollo Local</h4>
            <CodeBlock code={baseUrlLocal} />
            <p className="mt-4 text-sm text-muted-foreground">
                Reemplaza &lt;TU_DOMINIO_DE_PRODUCCION&gt; con el dominio donde tienes desplegada la aplicación. Por ejemplo, si tu dominio es `histopago.com`, la URL para registrar ventas sería `https://histopago.com/api/sales`.
            </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Endpoints para Comercios</CardTitle>
            <CardDescription>
                A continuación se detallan los endpoints disponibles para los comercios.
            </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge>POST</Badge>
            <CardTitle className="text-xl">/api/sales</CardTitle>
          </div>
          <CardDescription>
            Este endpoint te permite registrar una nueva venta a crédito. El sistema calculará automáticamente el saldo a financiar, el monto de las cuotas y las fechas de vencimiento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h4 className="font-semibold">Cuerpo de la Solicitud (Request Body)</h4>
          <CodeBlock code={saleRequestBody} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge>POST</Badge>
            <CardTitle className="text-xl">/api/payments</CardTitle>
          </div>
          <CardDescription>
            Utiliza este endpoint para registrar un pago asociado a una venta existente. Los pagos registrados vía API son auto-verificados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h4 className="font-semibold">Cuerpo de la Solicitud (Request Body)</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Debes proporcionar el <code className="font-mono text-sm bg-muted px-1 rounded">invoiceNumber</code> (número de factura) y el <code className="font-mono text-sm bg-muted px-1 rounded">customerIdentification</code> (identificación del cliente) para que HistoPago pueda asociar el pago a la venta correcta.
          </p>
          <CodeBlock code={paymentRequestBody} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Endpoints para Clientes</CardTitle>
            <CardDescription>
                Endpoints que pueden ser utilizados por sistemas externos en nombre de un cliente autenticado.
            </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge>POST</Badge>
            <CardTitle className="text-xl">/api/customer/payments</CardTitle>
          </div>
          <CardDescription>
            Permite a un cliente autenticado reportar un pago para una de sus deudas. El pago quedará en estado "Pendiente de Verificación".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h4 className="font-semibold">Cuerpo de la Solicitud (Request Body)</h4>
          <CodeBlock code={customerPaymentRequestBody} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Respuestas del Servidor</CardTitle>
          <CardDescription>
            Las respuestas seguirán un formato estándar para indicar el éxito o fracaso de la operación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <h4 className="font-semibold">Respuesta Exitosa (Código 201)</h4>
          <CodeBlock code={successResponse} />
          <h4 className="mt-4 font-semibold">Respuesta de Error (Código 4xx)</h4>
          <CodeBlock code={errorResponse} />
        </CardContent>
      </Card>
    </div>
  );
}
