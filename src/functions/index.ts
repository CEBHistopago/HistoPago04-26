
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { runAutomatedCollections } from '@/ai/flows/run-collections-flow';
import { sendDailyReports } from '@/ai/flows/daily-reports-flow';
import { generateMonthlyInvoice } from '@/ai/flows/generate-invoice-flow';

// DOCUMENTACIÓN DE LA PROGRAMACIÓN (CRON SYNTAX):
// La cadena sigue el formato de Crontab de Unix.
// Se compone de 5 campos: Minuto Hora Día Mes DíaDeLaSemana
// '*' significa "cada". Por ejemplo, '*' en el campo de Hora significa "cada hora".
//
// Ejemplo: '30 6 * * *' -> Se ejecuta a las 6:30 AM, todos los días.

/**
 * ZONA HORARIA PARA TODAS LAS TAREAS PROGRAMADAS
 * Se utiliza el estándar de la base de datos de zonas horarias IANA.
 * 'America/Caracas' corresponde a VET (UTC-4).
 */
const TIMEZONE = 'America/Caracas';

/**
 * HORARIO PARA REPORTES DIARIOS A COMERCIOS
 * Se ejecuta todos los días a las 6:30 AM (Hora de Venezuela).
 */
const DAILY_REPORTS_SCHEDULE = '30 6 * * *';

/**
 * HORARIO PARA RECORDATORIOS AUTOMÁTICOS A CLIENTES
 * Se ejecuta todos los días a las 8:00 AM (Hora de Venezuela).
 */
const AUTOMATED_COLLECTIONS_SCHEDULE = '0 8 * * *';

/**
 * HORARIO PARA FACTURACIÓN MENSUAL
 * Se ejecuta el día 1 de cada mes a las 2:00 AM (Hora de Venezuela).
 */
const MONTHLY_BILLING_SCHEDULE = '0 2 1 * *';


/**
 * Tarea Programada: Reportes Diarios para Comercios.
 * Busca todos los comercios que han optado por el reporte diario, calcula sus
 * cuotas vencidas y por vencer, y les envía un correo con el resumen.
 */
export const dailyScheduledReports = onSchedule({ schedule: DAILY_REPORTS_SCHEDULE, timeZone: TIMEZONE }, async (event) => {
    console.log(`Ejecutando tarea programada de reportes diarios. Evento ID: ${event.jobName}, Hora Programada: ${event.scheduleTime}`);
    try {
        // Pasamos el tiempo de ejecución programado al flujo para garantizar la consistencia de la zona horaria.
        const result = await sendDailyReports({ scheduleTime: event.scheduleTime });
        console.log('Los reportes diarios se enviaron exitosamente.', result);
    } catch (error) {
        console.error('CRÍTICO: La función de reportes diarios falló por completo.', error);
    }
});

/**
 * Tarea Programada: Recordatorios de Cobranza.
 * Busca todas las cuotas vencidas o por vencer de los clientes de comercios con
 * planes automatizados y envía recordatorios por correo y/o SMS.
 */
export const automatedCollections = onSchedule({ schedule: AUTOMATED_COLLECTIONS_SCHEDULE, timeZone: TIMEZONE }, async (event) => {
    console.log(`Ejecutando tarea programada de cobranza automática. Evento ID: ${event.jobName}, Hora Programada: ${event.scheduleTime}`);
    try {
        // Pasamos el tiempo de ejecución programado al flujo para garantizar la consistencia de la zona horaria.
        const result = await runAutomatedCollections({ scheduleTime: event.scheduleTime });
        console.log('La cobranza automática finalizó exitosamente.', result);
    } catch (error) {
        console.error('CRÍTICO: La función de cobranza automática falló por completo.', error);
    }
});

/**
 * Tarea Programada: Facturación Mensual a Comercios.
 * Genera una factura para cada comercio activo, calculando el costo basado en
 * la tarifa base y el número de créditos activos durante el mes anterior.
 * Luego, envía la factura por correo.
 */
export const monthlyBilling = onSchedule({ schedule: MONTHLY_BILLING_SCHEDULE, timeZone: TIMEZONE }, async (event) => {
    console.log(`Ejecutando tarea programada de facturación mensual. Evento ID: ${event.jobName}`);
    
    // This requires getting all vendors from within a server-side context.
    const { firestore } = await initializeFirebaseAdmin();
    const vendorsSnapshot = await firestore.collection('vendors').where('status', '==', 'Activo').get();
    
    if (vendorsSnapshot.empty) {
        console.log('No active vendors to bill. Exiting.');
        return;
    }

    for (const vendorDoc of vendorsSnapshot.docs) {
        try {
            console.log(`Generating invoice for vendor: ${vendorDoc.id} (${vendorDoc.data().name})`);
            await generateMonthlyInvoice({ 
                vendorId: vendorDoc.id,
                billingDate: event.scheduleTime // Use the scheduled time to determine the billing month
            });

            // --- RATE LIMITING ---
            // Wait 350ms between invoices to stay safely under Resend quota (max 4/sec)
            await new Promise((resolve) => setTimeout(resolve, 350));
        } catch (error) {
            console.error(`CRÍTICO: Falló la generación de factura para el comercio ${vendorDoc.id}.`, error);
        }
    }
});
