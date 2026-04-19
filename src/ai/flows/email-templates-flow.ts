
'use server';
/**
 * @fileOverview Flows for managing email templates stored in Firestore.
 * - getEmailTemplates: Retrieves all email templates.
 * - saveEmailTemplates: Saves all email templates.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { EmailTemplates, EmailTemplatesSchema } from '@/lib/data';


const defaultTemplates: EmailTemplates = {
    paymentNotification: {
        subject: 'Confirmación de Pago Recibido - {{vendorName}}',
        body: `Hola {{customerName}},\n\nHemos registrado tu pago con fecha de {{paymentDate}}, por el monto de {{paymentAmount}}, a la factura #{{invoiceNumber}}.\n\nTu nuevo saldo pendiente es de {{dueAmount}}.\n\n¡Gracias por tu pago!\n\nAtentamente,\nEl equipo de {{vendorName}}`
    },
    completion: {
        subject: '¡Crédito Completado! Gracias por tu confianza - {{vendorName}}',
        body: `¡Felicidades {{customerName}}!\n\nHemos registrado tu pago con fecha de {{paymentDate}}, por el monto de {{paymentAmount}}, a la factura #{{invoiceNumber}}, con el cual has finalizado exitosamente tu compromiso.\n\nDe parte de todo el equipo de {{vendorName}}, agradecemos tu confianza y excelente historial de pago. ¡Esperamos volver a hacer negocios contigo pronto!\n\nAtentamente,\nEl equipo de {{vendorName}}`
    },
    reminder: {
        subject: 'Recordatorio Amistoso de Pago - {{vendorName}}',
        body: `Hola {{customerName}},\n\nTe escribimos de parte de {{vendorName}} para recordarte amistosamente de un próximo pago.\n\nDetalles de tu pago programado:\n\nMonto de la cuota: {{dueAmount}}\nFecha de vencimiento: {{dueDate}}\nFactura asociada: Nº {{invoiceNumber}}\n\nTe invitamos a realizar tu pago a tiempo para mantener tu cuenta al día y tu buen historial crediticio. Si ya realizaste el pago, puedes ignorar este mensaje.\n\nGracias por tu confianza.`
    },
    overdue: {
        subject: 'Notificación de Saldo Vencido - {{vendorName}}',
        body: `Hola {{customerName}},\n\nTe escribimos de parte de {{vendorName}} para notificarte que la cuota de tu crédito por la factura #{{invoiceNumber}} ha vencido.\n\nDetalles de la cuota vencida:\nMonto: {{dueAmount}}\nFecha de vencimiento original: {{dueDate}}\n\nEs importante que realices tu pago lo antes posible para evitar afectar negativamente tu historial crediticio. Si ya realizaste el pago recientemente, puedes ignorar este mensaje.\n\nAtentamente,\nEl equipo de {{vendorName}}`
    },
    newSaleConfirmation: {
        subject: 'Nuevo Crédito Registrado - {{vendorName}}',
        body: `Hola {{customerName}},\n\nTu comercio amigo {{vendorName}} ha registrado un nuevo crédito a tu nombre por la factura #{{invoiceNumber}}, por un monto total de {{totalAmount}}.\n\nPor favor, ingresa a tu cuenta de HistoPago para revisar los detalles y confirmar el compromiso.\n\n<a href="{{confirmationUrl}}" style="background-color: #3B82F6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Confirmar Compromiso</a>\n\nAtentamente,\nEl equipo de HistoPago`
    },
    dailyOverdueReport: {
        subject: 'Reporte Diario de Cobranza - {{vendorName}} - {{reportDate}}',
        body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; color: #333; }
    .container { max-width: 680px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
    .header { text-align: center; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 15px; }
    .summary { display: flex; justify-content: space-around; background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .summary-item { text-align: center; }
    .summary-item p { margin: 0; font-size: 14px; color: #666; }
    .summary-item .value { font-size: 22px; font-weight: bold; color: #d9534f; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    .footer { margin-top: 20px; font-size: 12px; text-align: center; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Reporte Diario de Cobranza</h2>
      <p>Para: <strong>{{vendorName}}</strong> | Fecha: <strong>{{reportDate}}</strong></p>
    </div>
    <p>Hola {{vendorName}},</p>
    <p>Este es tu resumen diario de cuotas que requieren tu atención. Incluye las cuotas que vencen hoy y las que ya se encuentran vencidas.</p>
    <div class="summary">
      <div class="summary-item">
        <p>Monto Total Vencido</p>
        <span class="value">{{totalOverdueAmount}}</span>
      </div>
      <div class="summary-item">
        <p>Clientes con Deuda</p>
        <span class="value">{{overdueClientsCount}}</span>
      </div>
    </div>
    <h3>Detalle de Cuotas Vencidas y por Vencer Hoy:</h3>
    {{overdueInstallmentsTable}}
    <p>Te recomendamos contactar a estos clientes para gestionar la cobranza. Puedes ver el detalle completo en tu panel de control.</p>
    <div class="footer">
      <p>Este es un correo automático generado por HistoPago.</p>
    </div>
  </div>
</body>
</html>`
    },
    monthlyInvoice: {
        subject: 'Tu Factura de HistoPago para el Período {{period}}',
        body: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; color: #333; }
    .container { max-width: 680px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; }
    .header { text-align: center; border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 15px; }
    .summary { display: flex; justify-content: space-around; background-color: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; }
    .summary-item { text-align: center; }
    .summary-item p { margin: 0; font-size: 14px; color: #666; }
    .summary-item .value { font-size: 28px; font-weight: bold; color: #1d4ed8; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    .total-row td { border-top: 2px solid #333; font-weight: bold; font-size: 16px; }
    .footer { margin-top: 20px; font-size: 12px; text-align: center; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Factura de Servicios HistoPago</h2>
      <p>Para: <strong>{{vendorName}}</strong></p>
      <p>Fecha de Factura: <strong>{{invoiceDate}}</strong> | Período: <strong>{{period}}</strong></p>
    </div>
    <p>Hola {{vendorName}},</p>
    <p>Adjunto encontrarás el resumen de tu facturación por el uso de la plataforma HistoPago durante el último período. Agradecemos tu confianza en nuestros servicios.</p>
    
    <h3 style="margin-top: 25px;">Detalle de Facturación:</h3>
    {{invoiceTable}}

    <div class="summary">
      <div class="summary-item">
        <p>Monto Total a Pagar</p>
        <span class="value">$ {{totalAmount}}</span>
      </div>
    </div>

    <p>Por favor, realiza tu pago a la brevedad para mantener tu cuenta activa y seguir disfrutando de todos los beneficios de HistoPago. Puedes reportar tu pago desde el panel de suscripción en la plataforma.</p>
    
    <div class="footer">
      <p>Este es un correo automático generado por HistoPago.</p>
    </div>
  </div>
</body>
</html>`
    }
};

const getTemplatesRef = async () => {
    const { firestore } = await initializeFirebaseAdmin();
    return firestore.collection('settings').doc('email_templates');
}

export async function getEmailTemplates(): Promise<EmailTemplates> {
    return getEmailTemplatesFlow();
}

const getEmailTemplatesFlow = ai.defineFlow(
    {
        name: 'getEmailTemplatesFlow',
        outputSchema: EmailTemplatesSchema,
    },
    async () => {
        try {
            const docRef = await getTemplatesRef();
            const docSnap = await docRef.get();

            if (!docSnap.exists()) {
                await docRef.set(defaultTemplates);
                return defaultTemplates;
            } else {
                const dataFromDb = docSnap.data() as Partial<EmailTemplates>;
                const finalTemplates: EmailTemplates = { ...defaultTemplates };

                (Object.keys(defaultTemplates) as Array<keyof EmailTemplates>).forEach(key => {
                    const dbTemplate = dataFromDb[key];
                    const defaultTemplate = defaultTemplates[key];

                    // SI la plantilla en DB no tiene la variable crítica {{invoiceTable}} o {{overdueInstallmentsTable}},
                    // forzamos el uso de la por defecto para no romper el desglose.
                    const isAdvancedTemplate = key === 'monthlyInvoice' || key === 'dailyOverdueReport';
                    const hasRequiredVariable = dbTemplate?.body?.includes('Table}}');

                    if (dbTemplate && dbTemplate.subject && dbTemplate.body) {
                        if (isAdvancedTemplate && !hasRequiredVariable) {
                            console.warn(`Template ${key} is missing required table variable. Reverting to default.`);
                            finalTemplates[key] = defaultTemplate;
                        } else {
                            finalTemplates[key] = {
                                subject: dbTemplate.subject,
                                body: dbTemplate.body
                            };
                        }
                    } else if (defaultTemplate) {
                        finalTemplates[key] = defaultTemplate;
                    }
                });

                return EmailTemplatesSchema.parse(finalTemplates);
            }
        } catch (error) {
            console.error("Error fetching/validating email templates, returning defaults:", error);
            return defaultTemplates;
        }
    }
);


export async function saveEmailTemplates(templates: EmailTemplates): Promise<{ success: boolean; message: string }> {
    return saveEmailTemplatesFlow(templates);
}

const saveEmailTemplatesFlow = ai.defineFlow(
    {
        name: 'saveEmailTemplatesFlow',
        inputSchema: EmailTemplatesSchema,
        outputSchema: z.object({ success: z.boolean(), message: z.string() }),
    },
    async (templates) => {
        try {
            const docRef = await getTemplatesRef();
            // Aseguramos que no se guarden campos vacíos que puedan romper el getEmailTemplates
            await docRef.set(templates, { merge: true });
            return { success: true, message: 'Plantillas guardadas correctamente.' };
        } catch (error: any) {
            console.error('Error saving email templates:', error);
            return { success: false, message: 'No se pudieron guardar las plantillas.' };
        }
    }
);
