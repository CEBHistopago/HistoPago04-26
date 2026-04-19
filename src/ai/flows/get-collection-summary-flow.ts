'use server';
/**
 * @fileOverview A flow to calculate monthly collection summaries (to-collect vs. collected).
 * Fixed: 'toCollect' now includes rollover of unpaid balances from previous months.
 * Fixed: 'collected' is now based on the actual payment date, not the installment due date.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CollectionSummarySchema, CreditSale, Payment, CollectionSummary } from '@/lib/data';
import { startOfMonth, endOfMonth, subMonths, addMonths, format, startOfDay, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { addWeeks, addQuarters } from 'date-fns';

const GetCollectionSummaryInputSchema = z.object({
  vendorId: z.string(),
});

export async function getCollectionSummary(input: z.infer<typeof GetCollectionSummaryInputSchema>): Promise<CollectionSummary> {
  return getCollectionSummaryFlow(input);
}

const getCollectionSummaryFlow = ai.defineFlow(
  {
    name: 'getCollectionSummaryFlow',
    inputSchema: GetCollectionSummaryInputSchema,
    outputSchema: CollectionSummarySchema,
  },
  async ({ vendorId }) => {
    const { firestore } = await initializeFirebaseAdmin();
    const now = new Date();

    // Definimos los rangos de fecha para los 3 buckets
    const ranges = {
      previousMonth: {
        start: startOfMonth(subMonths(now, 1)),
        end: endOfMonth(subMonths(now, 1)),
        period: format(subMonths(now, 1), "MMMM yyyy", { locale: es }),
      },
      currentMonth: {
        start: startOfMonth(now),
        end: endOfMonth(now),
        period: format(now, "MMMM yyyy", { locale: es }),
      },
      nextMonth: {
        start: startOfMonth(addMonths(now, 1)),
        end: endOfMonth(addMonths(now, 1)),
        period: format(addMonths(now, 1), "MMMM yyyy", { locale: es }),
      },
    };

    const summary: CollectionSummary = {
      previousMonth: { period: ranges.previousMonth.period, toCollect: 0, collected: 0 },
      currentMonth: { period: ranges.currentMonth.period, toCollect: 0, collected: 0 },
      nextMonth: { period: ranges.nextMonth.period, toCollect: 0, collected: 0 },
    };

    try {
      const salesSnapshot = await firestore
        .collection('vendors')
        .doc(vendorId)
        .collection('sales')
        .get();

      if (salesSnapshot.empty) {
        return summary;
      }

      for (const saleDoc of salesSnapshot.docs) {
        const sale = { id: saleDoc.id, ...saleDoc.data() } as CreditSale;
        
        // Ignorar ventas que no están activas o están cerradas administrativamente
        if (sale.status === 'Pendiente de Confirmación' || sale.status === 'Cerrado Administrativamente') {
            continue;
        }

        if (!sale.firstPaymentDate || !sale.numberOfInstallments || sale.installmentAmount <= 0) {
          continue;
        }

        // Obtener todos los pagos verificados de la venta
        const paymentsSnapshot = await saleDoc.ref.collection('payments').where('status', '==', 'Verificado').get();
        const verifiedPayments = paymentsSnapshot.docs.map(doc => doc.data() as Payment);

        // --- 1. CALCULO DE 'COBRADO' (Basado estrictamente en la fecha real en que ocurrió el pago) ---
        verifiedPayments.forEach(p => {
            const pDate = p.paymentDate.toDate ? p.paymentDate.toDate() : new Date(p.paymentDate);
            
            if (isWithinInterval(pDate, { start: ranges.previousMonth.start, end: ranges.previousMonth.end })) {
                summary.previousMonth.collected += p.amount;
            } else if (isWithinInterval(pDate, { start: ranges.currentMonth.start, end: ranges.currentMonth.end })) {
                summary.currentMonth.collected += p.amount;
            } else if (isWithinInterval(pDate, { start: ranges.nextMonth.start, end: ranges.nextMonth.end })) {
                summary.nextMonth.collected += p.amount;
            }
        });

        // --- 2. CALCULO DE 'POR COBRAR' (Cuotas del mes + Deuda vencida acumulada) ---
        
        // Agrupamos cuánto se ha pagado de cada cuota específica para detectar morosidad
        const paymentsByInstallment: Record<number, number> = {};
        verifiedPayments.forEach(p => {
          if (p.appliedToInstallments) {
            for (const instNumStr in p.appliedToInstallments) {
              const installmentNumber = parseInt(instNumStr, 10);
              paymentsByInstallment[installmentNumber] = (paymentsByInstallment[installmentNumber] || 0) + p.appliedToInstallments[instNumStr];
            }
          }
        });
        
        const firstPaymentDate = startOfDay(sale.firstPaymentDate.toDate ? sale.firstPaymentDate.toDate() : new Date(sale.firstPaymentDate));

        for (let i = 1; i <= sale.numberOfInstallments; i++) {
          let dueDate: Date;
          const index = i - 1;
          switch (sale.paymentFrequency) {
            case 'Semanal': dueDate = addWeeks(firstPaymentDate, index); break;
            case 'Quincenal': dueDate = addWeeks(firstPaymentDate, index * 2); break;
            case 'Mensual': dueDate = addMonths(firstPaymentDate, index); break;
            case 'Trimestral': dueDate = addQuarters(firstPaymentDate, index); break;
            default: continue;
          }
          
          const instDueDate = startOfDay(dueDate);
          const paidForThisInst = paymentsByInstallment[i] || 0;
          const unpaidBalance = Math.max(0, sale.installmentAmount - paidForThisInst);

          // Lógica de Atribución a los Buckets con Rollover (Arrastre)

          // BUCKET: Mes Anterior
          if (isWithinInterval(instDueDate, { start: ranges.previousMonth.start, end: ranges.previousMonth.end })) {
              summary.previousMonth.toCollect += sale.installmentAmount;
          } else if (instDueDate < ranges.previousMonth.start && unpaidBalance > 0.01) {
              // Si la cuota es más vieja que el mes anterior y sigue debiéndose, se suma a la meta del mes anterior
              summary.previousMonth.toCollect += unpaidBalance;
          }

          // BUCKET: Mes Actual
          if (isWithinInterval(instDueDate, { start: ranges.currentMonth.start, end: ranges.currentMonth.end })) {
              summary.currentMonth.toCollect += sale.installmentAmount;
          } else if (instDueDate < ranges.currentMonth.start && unpaidBalance > 0.01) {
              // ROLLOVERS: Todo lo que se venció antes de hoy y no se pagó, es meta de cobro para el mes actual
              summary.currentMonth.toCollect += unpaidBalance;
          }

          // BUCKET: Mes Próximo
          if (isWithinInterval(instDueDate, { start: ranges.nextMonth.start, end: ranges.nextMonth.end })) {
              summary.nextMonth.toCollect += sale.installmentAmount;
          } else if (instDueDate < ranges.nextMonth.start && unpaidBalance > 0.01) {
              // Rollover a futuro
              summary.nextMonth.toCollect += unpaidBalance;
          }
        }
      }

      return summary;
    } catch (error) {
      console.error("Error in getCollectionSummaryFlow:", error);
      return summary;
    }
  }
);
