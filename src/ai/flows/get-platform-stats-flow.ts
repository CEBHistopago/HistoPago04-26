'use server';
/**
 * @fileOverview Flow para obtener estadísticas globales de la plataforma.
 * - getPlatformStats: Calcula el total de usuarios con cuenta de acceso (Admins + Vendors + Registered Customers).
 * - Distingue entre perfiles de clientes (registros de deudas) y usuarios reales con acceso a la App.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';

const PlatformStatsOutputSchema = z.object({
    totalUsers: z.number().describe("Suma de Admins, Comercios y Clientes con cuenta propia."),
    adminsCount: z.number(),
    vendorsCount: z.number(),
    customersCount: z.number().describe("Total de perfiles en la base de datos de clientes."),
    registeredCustomersCount: z.number().describe("Clientes que han creado su propia cuenta de acceso."),
});

export async function getPlatformStats(): Promise<z.infer<typeof PlatformStatsOutputSchema>> {
  return getPlatformStatsFlow();
}

const getPlatformStatsFlow = ai.defineFlow(
  {
    name: 'getPlatformStatsFlow',
    outputSchema: PlatformStatsOutputSchema,
  },
  async () => {
    try {
        const { firestore } = await initializeFirebaseAdmin();
        
        // Ejecutamos las consultas de conteo en paralelo
        const [adminsSnap, vendorsSnap, customersTotalSnap, registeredCustomersSnap] = await Promise.all([
            firestore.collection('admins').count().get(),
            firestore.collection('vendors').count().get(),
            firestore.collection('customers').count().get(),
            // Contamos clientes que tienen la marca 'isRegistered'
            // NOTA: Para usuarios antiguos sin esta marca, el conteo será 0 hasta que se registren/actualicen.
            firestore.collection('customers').where('isRegistered', '==', true).count().get()
        ]);

        const adminsCount = adminsSnap.data().count;
        const vendorsCount = vendorsSnap.data().count;
        const customersCount = customersTotalSnap.data().count;
        const registeredCustomersCount = registeredCustomersSnap.data().count;

        // El total de usuarios con acceso es la suma de todos los que pueden hacer login
        const totalUsersWithAccess = adminsCount + vendorsCount + registeredCustomersCount;

        return {
            adminsCount,
            vendorsCount,
            customersCount,
            registeredCustomersCount,
            totalUsers: totalUsersWithAccess
        };
    } catch (error) {
        console.error("Error en getPlatformStatsFlow:", error);
        return { totalUsers: 0, adminsCount: 0, vendorsCount: 0, customersCount: 0, registeredCustomersCount: 0 };
    }
  }
);
