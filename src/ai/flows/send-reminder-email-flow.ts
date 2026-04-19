
'use server';
/**
 * @fileOverview A flow for sending templated emails.
 * - sendReminderEmail - Fetches a template, replaces placeholders, and sends the email.
 */
import { z } from 'zod';
import { ai } from '@/ai/genkit';
import { format, parseISO } from 'date-fns';
import { sendEmail } from './mailer-flow';
import { getEmailTemplates, EmailTemplates } from './email-templates-flow';
import { SendReminderInputSchema, SendReminderOutputSchema, SendReminderInput, SendReminderOutput } from '@/lib/data';

// This function remains the public interface for sending emails.
export async function sendReminderEmail(
  input: SendReminderInput
): Promise<SendReminderOutput> {
  console.log('[EMAIL_SENDER_FLOW] Received request:', input);
  return sendTemplatedEmailFlow(input);
}

// Replaces placeholders like {{variable}} in a string with values from a data object.
function hydrateTemplate(template: string, data: Record<string, any>): string {
  // Use a regex to find all {{variable}} placeholders
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, key) => {
    // Check if the key exists in our data object and is not null/undefined.
    if (data.hasOwnProperty(key) && data[key] !== null && data[key] !== undefined) {
      return String(data[key]);
    }
    // If the key does not exist or is null/undefined, return an empty string to prevent errors.
    return '';
  });
}


const sendTemplatedEmailFlow = ai.defineFlow(
  {
    name: 'sendTemplatedEmailFlow',
    inputSchema: SendReminderInputSchema,
    outputSchema: SendReminderOutputSchema,
  },
  async (input) => {
    console.log('[EMAIL_SENDER_FLOW] Looking for template for type:', input.emailType);

    // 1. Fetch all email templates from Firestore.
    let allTemplates: EmailTemplates;
    try {
        allTemplates = await getEmailTemplates();
    } catch(e: any) {
        const errorMsg = `Could not fetch email templates: ${e.message}`;
        console.error(`[EMAIL_SENDER_FLOW] Error: ${errorMsg}`);
        return { success: false, message: errorMsg };
    }
    
    const template = allTemplates[input.emailType];

    if (!template) {
        const errorMsg = `No email template found for type "${input.emailType}".`;
        console.error(`[EMAIL_SENDER_FLOW] Error: ${errorMsg}`);
        return { success: false, message: errorMsg };
    }

    // 2. Prepare data for hydration safely.
    const dataForHydration: Record<string, any> = { ...input };
    
    // Add confirmation URL for new sales
    if (input.emailType === 'newSaleConfirmation') {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
        dataForHydration.confirmationUrl = `${baseUrl}/customer/commitments`;
    }

    // SAFELY format dates and numbers, only if they exist in the input.
    if (input.paymentDate) {
        try {
            dataForHydration.paymentDate = format(parseISO(input.paymentDate), 'dd/MM/yyyy');
        } catch (error) {
             console.warn('[EMAIL_SENDER_FLOW] Could not parse paymentDate for formatting, using original value.', input.paymentDate);
        }
    }
    
    if (input.paymentAmount !== undefined && input.paymentAmount !== null) {
        dataForHydration.paymentAmount = input.paymentAmount.toFixed(2);
    }
    
    if (input.dueAmount !== undefined && input.dueAmount !== null) {
        dataForHydration.dueAmount = input.dueAmount.toFixed(2);
    }

    if (input.totalAmount !== undefined && input.totalAmount !== null) {
        dataForHydration.totalAmount = input.totalAmount.toFixed(2);
    }

    // 3. Hydrate the subject and body with the data.
    const hydratedSubject = hydrateTemplate(template.subject, dataForHydration);
    const hydratedBody = hydrateTemplate(template.body, dataForHydration);

    console.log('[EMAIL_SENDER_FLOW] Template hydrated. Preparing to send via mailer flow.');

    const resendDomain = process.env.RESEND_DOMAIN;
    if (!resendDomain) {
        const errorMsg = 'Resend domain is not configured on the server.';
        console.error(`[EMAIL_SENDER_FLOW] Error: ${errorMsg}`);
        return { success: false, message: errorMsg };
    }
    
    // 4. Construct the final email payload.
    // Use HistoPago as the sender name for system notifications to vendors.
    const isSystemEmail = input.emailType === 'dailyOverdueReport' || input.emailType === 'monthlyInvoice';
    const rawDisplayName = isSystemEmail ? "HistoPago" : `${input.vendorName} via HistoPago`;
    
    // Sanitize display name: Remove quotes and wrap in double quotes for SMTP compliance
    const cleanDisplayName = rawDisplayName.replace(/"/g, '');
    const fromAddress = `"${cleanDisplayName}" <noreply@${resendDomain}>`;
    
    const toAddress = input.to;
    
    // The body for daily report and monthly invoice is already full HTML. For others, we wrap it.
    const emailBodyHtml = (input.emailType === 'dailyOverdueReport' || input.emailType === 'monthlyInvoice')
      ? hydratedBody
      : `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; text-align: left; }
            p { margin: 0 0 1em 0; }
          </style>
        </head>
        <body>
          <div class="container">
            ${hydratedBody.replace(/\n/g, '<br />')}
          </div>
        </body>
      </html>
    `;

    const replyTo = input.vendorEmail && input.vendorEmail.includes('@')
        ? [input.vendorEmail]
        : undefined;

    // 5. Delegate sending to the dedicated mailer flow.
    console.log(`[EMAIL_SENDER_FLOW] Calling mailer flow with payload to:`, toAddress);
    const emailResult = await sendEmail({
        from: fromAddress,
        to: toAddress,
        subject: hydratedSubject,
        html: emailBodyHtml,
        ...(replyTo && { reply_to: replyTo }),
    });

    console.log(`[EMAIL_SENDER_FLOW] Mailer flow finished. Success: ${emailResult.success}. Message: ${emailResult.message}`);

    return emailResult;
  }
);
