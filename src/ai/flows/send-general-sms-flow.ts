
'use server';
/**
 * @fileOverview A generic flow for sending various types of SMS messages.
 * - sendSms: Constructs a message based on a type and sends it via Twilio.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Twilio } from 'twilio';

// Input schema allowing for different message types and dynamic data
const SmsPayloadSchema = z.object({
  customerName: z.string(),
  customerPhone: z.string().describe("Customer's phone number in E.164 format, e.g., +14155552671"),
  vendorName: z.string(),
  messageType: z.enum(['newSale', 'reminder', 'overdue']),
  // Optional data for different message types
  dueAmount: z.number().optional(),
  invoiceNumber: z.string().optional(),
  totalAmount: z.number().optional(),
});

const SmsOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  sid: z.string().optional(),
});

export type SmsPayload = z.infer<typeof SmsPayloadSchema>;
export type SmsOutput = z.infer<typeof SmsOutputSchema>;

export async function sendSms(
  input: SmsPayload
): Promise<SmsOutput> {
  return sendSmsFlow(input);
}

// Function to generate the message body based on the type
const generateMessageBody = (payload: SmsPayload): string => {
    switch (payload.messageType) {
        case 'newSale':
            return `HistoPago: ${payload.vendorName} ha registrado un nuevo credito a tu nombre por $${payload.totalAmount?.toFixed(2)} (factura #${payload.invoiceNumber}). Por favor, ingresa a tu cuenta para confirmar.`;
        case 'reminder':
            return `HistoPago te recuerda! ${payload.customerName}, tu cuota con ${payload.vendorName} por $${payload.dueAmount?.toFixed(2)} esta proxima a vencer.`;
        case 'overdue':
             return `HistoPago - Saldo Vencido: ${payload.customerName}, te recordamos que tu credito con ${payload.vendorName} (factura #${payload.invoiceNumber}) presenta un saldo vencido de $${payload.dueAmount?.toFixed(2)}. Realiza tu pago para mantener tu historial al dia.`;
        default:
            // Fallback or error for unknown message type
            const exhaustiveCheck: never = payload.messageType;
            throw new Error(`Tipo de mensaje SMS no reconocido: ${exhaustiveCheck}`);
    }
};

const sendSmsFlow = ai.defineFlow(
  {
    name: 'sendSmsFlow',
    inputSchema: SmsPayloadSchema,
    outputSchema: SmsOutputSchema,
  },
  async (payload) => {
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
        const errorMsg = 'La configuracion de Twilio (SID, Token, o numero) no esta completa en el servidor.';
        console.error(`[SMS_FLOW] ${errorMsg}`);
        return { success: false, message: errorMsg };
    }

    const client = new Twilio(accountSid, authToken);
    const messageBody = generateMessageBody(payload);

    try {
        console.log(`[SMS_FLOW] Attempting to send SMS to: ${payload.customerPhone} from: ${fromNumber}`);
        const message = await client.messages.create({
            body: messageBody,
            from: fromNumber,
            to: payload.customerPhone
        });
        
        console.log(`[SMS_FLOW] SMS successfully dispatched. SID: ${message.sid}`);
        return {
            success: true,
            message: `SMS enviado exitosamente a ${payload.customerPhone}.`,
            sid: message.sid,
        };

    } catch (error: any) {
        console.error("[SMS_FLOW] Error sending SMS via Twilio:", error);
        
        // Provide a more specific error message for the client
        let errorMessage = 'Error al enviar SMS.';
        if (error.code === 21211) {
            errorMessage = `El número de teléfono '${payload.customerPhone}' no es válido o no está en formato E.164.`;
        } else if (error.code === 20003) {
            errorMessage = 'Error de autenticación con Twilio. Revisa tus credenciales (SID y Token).';
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
