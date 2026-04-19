'use server';
/**
 * @fileOverview An AI flow for verifying a user's identity by comparing their ID document to a selfie.
 * - verifyIdentity: Compares a photo of an ID document with a selfie, extracts data, and confirms a match.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// ****** VERIFY IDENTITY FLOW ******

export const VerifyIdentityInputSchema = z.object({
  idPhotoDataUri: z
    .string()
    .describe(
      "A photo of the user's government-issued ID, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  selfieDataUri: z
    .string()
    .describe(
      "A selfie photo of the user, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type VerifyIdentityInput = z.infer<typeof VerifyIdentityInputSchema>;

export const VerifyIdentityOutputSchema = z.object({
  isMatch: z.boolean().describe("Whether the face in the selfie matches the face on the ID document."),
  matchConfidence: z.number().describe("The confidence score (0.0 to 1.0) of the face match."),
  extractedName: z.string().describe("The full name extracted from the ID document. Returns empty if not found."),
  extractedIdNumber: z.string().describe("The identification number extracted from the ID document. Returns empty if not found."),
  failureReason: z.string().optional().describe("The reason for verification failure, if any (e.g., 'Faces do not match', 'ID is blurry', 'Selfie is unclear')."),
});
export type VerifyIdentityOutput = z.infer<typeof VerifyIdentityOutputSchema>;


export async function verifyIdentity(
  input: VerifyIdentityInput
): Promise<VerifyIdentityOutput> {
  return verifyIdentityFlow(input);
}


const verificationPrompt = ai.definePrompt({
    name: 'identityVerificationPrompt',
    input: { schema: VerifyIdentityInputSchema },
    output: { schema: VerifyIdentityOutputSchema },
    prompt: `You are an expert identity verification system. Your task is to analyze two images: an ID document and a selfie.

    1. **Analyze the ID Document**:
       - Carefully examine the ID document provided in the 'idPhotoDataUri'.
       - Extract the full name of the person.
       - Extract the official identification number (Cédula de Identidad or RIF in Venezuela).

    2. **Analyze the Selfie**:
       - Examine the selfie provided in the 'selfieDataUri'.

    3. **Compare Faces**:
       - Compare the face in the selfie with the face in the photo on the ID document.
       - Determine if they are the same person with a high degree of certainty.

    4. **Provide a Structured Response**:
       - **isMatch**: Set to 'true' only if the faces are a clear match. Otherwise, set to 'false'.
       - **matchConfidence**: Provide a confidence score from 0.0 (no match) to 1.0 (perfect match).
       - **extractedName**: Fill with the full name extracted from the ID. If you cannot read it clearly, return an empty string.
       - **extractedIdNumber**: Fill with the ID number extracted from the ID. If you cannot read it clearly, return an empty string.
       - **failureReason**: If 'isMatch' is false or if data extraction fails, provide a brief, clear reason (e.g., "Faces do not match", "ID document is blurry", "Selfie is unclear", "Could not extract ID number").

    **IMAGES:**
    - ID Document: {{media url=idPhotoDataUri}}
    - Selfie: {{media url=selfieDataUri}}
    `,
});


const verifyIdentityFlow = ai.defineFlow(
  {
    name: 'verifyIdentityFlow',
    inputSchema: VerifyIdentityInputSchema,
    outputSchema: VerifyIdentityOutputSchema,
  },
  async (input) => {
    const { output } = await verificationPrompt(input);
    if (!output) {
      throw new Error('Identity verification failed to produce a result.');
    }
    return output;
  }
);
