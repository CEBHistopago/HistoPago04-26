'use server';
/**
 * @fileOverview A flow for sending reminder SMS to customers.
 * - sendReminderSms - Generates and sends a payment reminder SMS via Twilio.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Twilio } from 'twilio';
import { sendSms } from './send-general-sms-flow';

const SmsReminderInputSchema = z.object({
    customerName: z.string(),
    customerPhone: z.string().describe("Customer's phone number in E.164 format, e.g., +14155552671"),
    dueAmount: z.number(),
    vendorName: z.string(),
});

const SmsReminderOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  sid: z.string().optional(),
});

export async function sendReminderSms(
  input: z.infer<typeof SmsReminderInputSchema>
): Promise<z.infer<typeof SmsReminderOutputSchema>> {
  // Delegate to the new generic SMS flow
  return sendSms({
    ...input,
    messageType: 'reminder',
  });
}
