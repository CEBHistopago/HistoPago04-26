'use server';
/**
 * @fileOverview A server-side flow for creating a new customer account.
 * - createCustomerAccount: Handles user creation in Auth and profile creation in Firestore.
 * - Añade la marca 'isRegistered: true' para diferenciar cuentas activas de perfiles creados por comercios.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { getAuth } from 'firebase-admin/auth';
import { z } from 'zod';

const CreateCustomerInputSchema = z.object({
  fullName: z.string().min(1, 'El nombre es requerido.'),
  email: z.string().email('El correo no es válido.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
  identificationNumber: z.string().min(1, 'La identificación es requerida.'),
  phone: z.string().optional(),
});

const CreateCustomerOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerInputSchema>;
export type CreateCustomerOutput = z.infer<typeof CreateCustomerOutputSchema>;

export async function createCustomerAccount(input: CreateCustomerInput): Promise<CreateCustomerOutput> {
  return createCustomerAccountFlow(input);
}

const createCustomerAccountFlow = ai.defineFlow(
  {
    name: 'createCustomerAccountFlow',
    inputSchema: CreateCustomerInputSchema,
    outputSchema: CreateCustomerOutputSchema,
  },
  async ({ fullName, email, password, identificationNumber, phone }) => {
    const { adminApp, firestore } = await initializeFirebaseAdmin();
    const auth = getAuth(adminApp);

    try {
      // Step 1: Create user in Firebase Authentication. This will fail if the email exists.
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
        phoneNumber: phone,
      });

      const uid = userRecord.uid;

      // Step 2: Create user profile in Firestore in the 'customers' collection, using the UID as the document ID.
      const customerDocRef = firestore.collection('customers').doc(uid);
      await customerDocRef.set({
        name: fullName,
        email: email,
        identificationNumber: identificationNumber,
        phone: phone || '',
        role: 'customer', 
        isRegistered: true, // Marca fundamental para identificar cuentas con acceso a la app
      });

      return {
        success: true,
        message: 'Cuenta de cliente creada exitosamente.',
      };
    } catch (error: any) {
      console.error('Flow Error: createCustomerAccountFlow failed.', error);
      
      let errorMessage = 'Ocurrió un error inesperado al crear la cuenta.';
      if (error.code === 'auth/email-already-exists') {
        errorMessage = 'El correo electrónico ya está registrado. Por favor, utiliza otro.';
      } else if (error.code === 'auth/invalid-password') {
        errorMessage = 'La contraseña no es válida. Debe tener al menos 6 caracteres.';
      } else if (error.code === 'auth/invalid-phone-number') {
        errorMessage = 'El número de teléfono proporcionado no es válido.';
      }


      return {
        success: false,
        message: errorMessage,
      };
    }
  }
);
