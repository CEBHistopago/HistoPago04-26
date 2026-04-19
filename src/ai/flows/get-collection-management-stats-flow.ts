'use server';
/**
 * @fileOverview Flow para obtener estadísticas de gestión de cobranza (Hoy y Mes).
 * Extrae y agrega datos de la subcolección 'daily_management_stats' de forma robusta.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { format, startOfMonth, eachDayOfInterval } from 'date-fns';

const ManagementStatsSchema = z.object({
    whatsapp: z.number(),
    sms: z.number(),
    email: z.number(),
    push: z.number(),
    clientsContacted: z.number(),
});

const CollectionManagementOutputSchema = z.object({
    today: ManagementStatsSchema,
    thisMonth: ManagementStatsSchema,
});

export async function getCollectionManagementStats(vendorId: string): Promise<z.infer<typeof CollectionManagementOutputSchema>> {
    return getCollectionManagementStatsFlow(vendorId);
}

const getCollectionManagementStatsFlow = ai.defineFlow(
    {
        name: 'getCollectionManagementStatsFlow',
        inputSchema: z.string(),
        outputSchema: CollectionManagementOutputSchema,
    },
    async (vendorId) => {
        try {
            const { firestore } = await initializeFirebaseAdmin();
            const now = new Date();
            const todayStr = format(now, 'yyyy-MM-dd');
            
            // Calculamos todos los días del mes actual para pedir los documentos individualmente.
            // Este método es infalible porque no depende de consultas complejas ni índices.
            const start = startOfMonth(now);
            const days = eachDayOfInterval({ start, end: now });
            const dayStrings = days.map(d => format(d, 'yyyy-MM-dd'));

            const vendorRef = firestore.collection('vendors').doc(vendorId);
            const statsColl = vendorRef.collection('daily_management_stats');

            // Petición en paralelo de todos los días del mes.
            const promises = dayStrings.map(id => statsColl.doc(id).get());
            const snapshots = await Promise.all(promises);

            const result = {
                today: { whatsapp: 0, sms: 0, email: 0, push: 0, clientsContacted: 0 },
                thisMonth: { whatsapp: 0, sms: 0, email: 0, push: 0, clientsContacted: 0 }
            };

            snapshots.forEach((snap, index) => {
                if (snap.exists) {
                    const data = snap.data();
                    const dayId = dayStrings[index];
                    
                    const dayStats = {
                        whatsapp: data?.notifications?.whatsapp || 0,
                        sms: data?.notifications?.sms || 0,
                        email: data?.notifications?.email || 0,
                        push: data?.notifications?.push || 0,
                        clientsContacted: data?.contactedClientIds?.length || data?.clientsContactedCount || 0,
                    };

                    // Sumamos al acumulado del mes
                    result.thisMonth.whatsapp += dayStats.whatsapp;
                    result.thisMonth.sms += dayStats.sms;
                    result.thisMonth.email += dayStats.email;
                    result.thisMonth.push += dayStats.push;
                    result.thisMonth.clientsContacted += dayStats.clientsContacted;

                    // Si es el día de hoy, lo asignamos también a la columna de hoy
                    if (dayId === todayStr) {
                        result.today = dayStats;
                    }
                }
            });

            return result;
        } catch (error) {
            console.error("Error en getCollectionManagementStatsFlow:", error);
            // Retornamos ceros en caso de error para no afectar el resto del dashboard.
            const empty = { whatsapp: 0, sms: 0, email: 0, push: 0, clientsContacted: 0 };
            return { today: empty, thisMonth: empty };
        }
    }
);
