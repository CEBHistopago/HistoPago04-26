'use server';
/**
 * @fileOverview A dedicated flow for sending emails via Resend API.
 * This flow acts as a centralized mailer service for the application.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Resend } from 'resend';

const EmailPayloadSchema = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  html: z.string(),
  reply_to: z.array(z.string()).optional(),
});
export type EmailPayload = z.infer<typeof EmailPayloadSchema>;

const EmailOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  id: z.string().optional(),
});
export type EmailOutput = z.infer<typeof EmailOutputSchema>;


export async function sendEmail(payload: EmailPayload): Promise<EmailOutput> {
    return sendEmailFlow(payload);
}

const sendEmailFlow = ai.defineFlow(
  {
    name: 'sendEmailFlow',
    inputSchema: EmailPayloadSchema,
    outputSchema: EmailOutputSchema,
  },
  async (payload) => {
    try {
        // The Resend SDK for Node.js can automatically pick up the RESEND_API_KEY from process.env.
        // We initialize it without an argument to let it do so.
        const resend = new Resend();

        console.log(`[MAILER_FLOW] Attempting to send email from: ${payload.from} to: ${payload.to}`);
        
        const { data, error } = await resend.emails.send(payload);

        if (error) {
            console.error("[MAILER_FLOW] Error from Resend:", error);
            // The user is getting a generic message. Let's make it more specific.
            // If the API key is missing, Resend's SDK throws an error with a specific name.
            if (error.name === 'missing_api_key') {
                 throw new Error('La API key de Resend no está configurada en el servidor. Por favor, verifica que la variable de entorno RESEND_API_KEY esté correctamente definida y vuelve a intentarlo.');
            }
            throw error;
        }

        console.log(`[MAILER_FLOW] Email successfully dispatched to ${payload.to}. ID: ${data?.id}`);
        return {
            success: true,
            message: `Email sent to ${payload.to}.`,
            id: data?.id,
        };

    } catch (error: any) {
        console.error("[MAILER_FLOW] Full error object:", error);
        
        let clientMessage = `Error sending email.`;
        if (error.name === 'missing_api_key' || (error.message && error.message.includes('API key'))) {
             clientMessage = 'La API key de Resend no está configurada o es inválida. Por favor, verifica que la variable de entorno RESEND_API_KEY esté correctamente definida.';
        } else if (error.name === 'validation_error') {
             clientMessage = `Resend validation error: ${error.message}.`;
        } else if (error.message) {
            clientMessage = `Resend error: ${error.message}`;
        }
        
        return {
            success: false,
            message: clientMessage,
        };
    }
  }
);
