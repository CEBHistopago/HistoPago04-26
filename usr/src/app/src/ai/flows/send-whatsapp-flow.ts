
'use server';
/**
 * @fileOverview A generic flow for sending templated WhatsApp messages via Twilio.
 * - sendWhatsApp: Constructs and sends a message using a pre-approved template.
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
    let contentVariables: string;

    switch (payload.messageType) {
        case 'reminder':
            contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_REMINDER_SID;
            contentVariables = JSON.stringify({
                '1': payload.customerName,
                '2': payload.vendorName,
                '3': `$${payload.dueAmount?.toFixed(2) ?? '0.00'}`,
            });
            break;
        case 'overdue':
            contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_OVERDUE_SID;
             contentVariables = JSON.stringify({
                '1': payload.customerName,
                '2': payload.vendorName,
                '3': payload.invoiceNumber ?? 'N/A',
            });
            break;
        case 'newSale':
            contentSid = process.env.TWILIO_WHATSAPP_TEMPLATE_NEWSALE_SID;
             contentVariables = JSON.stringify({
                '1': payload.customerName,
                '2': payload.vendorName,
                '3': payload.invoiceNumber ?? 'N/A',
            });
            break;
        default:
            // This should not happen due to Zod validation, but it's good practice
            const exhaustiveCheck: never = payload.messageType;
            throw new Error(`Tipo de mensaje WhatsApp no reconocido: ${exhaustiveCheck}`);
    }

    if (!contentSid) {
        throw new Error(`El Template SID para el tipo de mensaje "${payload.messageType}" no está configurado en las variables de entorno (.env).`);
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
        const errorMsg = 'La configuración de Twilio para WhatsApp (SID, Token, o número) no está completa en el servidor.';
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
             errorMessage = `Error de plantilla (63018): Las variables no coinciden con la plantilla aprobada. Revisa la configuración.`;
        } else if (error.code === 63016) {
             errorMessage = `Error de plantilla (63016): La plantilla no ha sido aprobada o no existe. Verifica el Template SID.`;
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
