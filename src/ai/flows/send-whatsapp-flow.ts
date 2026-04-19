'use server';
/**
 * @fileOverview A generic flow for sending templated WhatsApp messages via Twilio.
 * 
 * MAPEO DE VARIABLES PARA PLANTILLAS (TWILIO CONTENT API):
 * Todas las plantillas ahora siguen este estándar:
 * - {{1}} = Nombre Cliente
 * - {{2}} = Nombre Comercio
 * - {{3}} = Nro Factura
 * - {{4}} = Monto de la Cuota (ej: $50.00)
 * - {{5}} = Fecha de Vencimiento (ej: 25/12/2024)
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Twilio } from 'twilio';

// Input schema for WhatsApp messages
const WhatsAppPayloadSchema = z.object({
  customerName: z.string(),
  customerPhone: z.string().describe("Customer's phone number in E.164 format, e.g., +14155552671"),
  vendorName: z.string(),
  messageType: z.enum(['newSale', 'reminder', 'overdue']),
  // Optional data for different message types
  dueAmount: z.number().optional(),
  invoiceNumber: z.string().optional(),
  dueDate: z.string().optional(),
});

const WhatsAppOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  sid: z.string().optional(),
});

export type WhatsAppPayload = z.infer<typeof WhatsAppPayloadSchema>;
export type WhatsAppOutput = z.infer<typeof WhatsAppOutputSchema>;

export async function sendWhatsApp(
  input: WhatsAppPayload
): Promise<WhatsAppOutput> {
  return sendWhatsAppFlow(input);
}

// Function to generate the template-based payload
const getTemplatePayload = (payload: WhatsAppPayload) => {
    let contentSid: string | undefined;
    
    const invoice = payload.invoiceNumber ?? 'N/A';
    const amount = `$${payload.dueAmount?.toFixed(2) ?? '0.00'}`;
    const date = payload.dueDate ?? 'N/A';

    switch (payload.messageType) {
        case 'reminder':
            contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_REMINDER_SID;
            break;
        case 'overdue':
            contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_OVERDUE_SID;
            break;
        case 'newSale':
            contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_NEWSALE_SID;
            break;
        default:
            const exhaustiveCheck: never = payload.messageType;
            throw new Error(`Tipo de mensaje WhatsApp no reconocido: ${exhaustiveCheck}`);
    }

    const contentVariables = JSON.stringify({
        '1': payload.customerName,
        '2': payload.vendorName,
        '3': invoice,
        '4': amount,
        '5': date,
    });

    if (!contentSid || !contentSid.startsWith('HX')) {
        const envVarName = `TWILIO_WHATSAPP_TEMPLATE_${payload.messageType.toUpperCase()}_SID`;
        throw new Error(`La variable de entorno ${envVarName} no está configurada o es inválida (debe empezar con 'HX').`);
    }

    return { contentSid, contentVariables };
};

const sendWhatsAppFlow = ai.defineFlow(
  {
    name: 'sendWhatsAppFlow',
    inputSchema: WhatsAppPayloadSchema,
    outputSchema: WhatsAppOutputSchema,
  },
  async (payload) => {
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER; // Uses the WhatsApp sender number

    if (!accountSid || !authToken || !fromNumber) {
        const errorMsg = 'La configuración base de Twilio (SID, Token o Número de WhatsApp) no está completa en el servidor.';
        console.error(`[WHATSAPP_FLOW] ${errorMsg}`);
        return { success: false, message: errorMsg };
    }

    try {
        const { contentSid, contentVariables } = getTemplatePayload(payload);
        const toWhatsAppNumber = `whatsapp:${payload.customerPhone}`;
        const fromWhatsAppNumber = `whatsapp:${fromNumber}`;

        console.log(`[WHATSAPP_FLOW] Attempting to send WhatsApp template ${contentSid} to: ${toWhatsAppNumber} from: ${fromWhatsAppNumber}`);
        
        const client = new Twilio(accountSid, authToken);
        const message = await client.messages.create({
            contentSid: contentSid,
            contentVariables: contentVariables,
            from: fromWhatsAppNumber,
            to: toWhatsAppNumber,
        });
        
        console.log(`[WHATSAPP_FLOW] WhatsApp successfully dispatched. SID: ${message.sid}`);
        return {
            success: true,
            message: `WhatsApp enviado exitosamente a ${payload.customerPhone}.`,
            sid: message.sid,
        };

    } catch (error: any) {
        console.error("[WHATSAPP_FLOW] Error sending WhatsApp via Twilio:", error);
        
        let errorMessage = 'Error al enviar WhatsApp.';
        if (error.code === 63018) { // Schema validation failed
             errorMessage = `Error de plantilla (63018): Las variables no coinciden con la plantilla aprobada en Twilio.`;
        } else if (error.code === 63016) {
             errorMessage = `Error de plantilla (63016): El SID de la plantilla no ha sido aprobado o no existe.`;
        } else if (error.code === 21614) {
             errorMessage = `El número de teléfono '${payload.customerPhone}' no parece ser un número de WhatsApp válido.`;
        } else if (error.message) {
            errorMessage = `Error de Twilio: ${error.message}`;
        }
        
        return {
            success: false,
            message: errorMessage,
        };
    }
  }
);