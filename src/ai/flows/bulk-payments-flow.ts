'use server';
/**
 * @fileOverview A server-side flow for processing bulk payments from a CSV file.
 * - processBulkPayments: Reads payment data, validates it, and creates records in Firestore.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { Timestamp, FieldValue, DocumentReference } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CreditSale, CreatePaymentSchema, Payment } from '@/lib/data';
import { isValid, format, startOfDay } from 'date-fns';

const BulkPaymentsInputSchema = z.object({
  vendorId: z.string(),
  paymentsData: z.array(z.any()),
  fileName: z.string(),
});

const BulkPaymentsOutputSchema = z.object({
  processed: z.number(),
  skipped: z.number(),
  errors: z.array(z.string()),
});

export async function processBulkPayments(
  input: z.infer<typeof BulkPaymentsInputSchema>
): Promise<z.infer<typeof BulkPaymentsOutputSchema>> {
  return processBulkPaymentsFlow(input);
}

const processBulkPaymentsFlow = ai.defineFlow(
  {
    name: 'processBulkPaymentsFlow',
    inputSchema: BulkPaymentsInputSchema,
    outputSchema: BulkPaymentsOutputSchema,
  },
  async ({ vendorId, paymentsData, fileName }) => {
    const { firestore } = await initializeFirebaseAdmin();
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    const vendorRef = firestore.collection('vendors').doc(vendorId);
    
    // --- OPTIMIZATION: Pre-fetch all sales for the vendor ---
    const salesSnapshot = await vendorRef.collection('sales').get();
    const salesMap = new Map<string, { id: string; ref: DocumentReference; data: CreditSale }>();
    salesSnapshot.forEach(doc => {
      const data = doc.data();
      // Create a unique key for each sale based on invoice and customer ID
      const key = `${data.invoiceNumber}_${data.customerIdentification}`;
      salesMap.set(key, { id: doc.id, ref: doc.ref, data: data as CreditSale });
    });
    // --- END OPTIMIZATION ---


    for (const [index, record] of paymentsData.entries()) {
      const rowIndex = index + 2;

      try {
        // --- 1. DATA VALIDATION ---
        const requiredFields = ['invoiceNumber', 'customerIdentification', 'amount', 'paymentDate', 'paymentMethod'];
        for (const field of requiredFields) {
            if (!record[field] || String(record[field]).trim() === '') {
                throw new Error(`Campo requerido '${field}' está vacío.`);
            }
        }
        
        // FIX: Force interpretation as local midnight to avoid UTC shift
        const paymentDate = new Date(`${record.paymentDate}T00:00:00`);
        if (!isValid(paymentDate)) {
             throw new Error('Formato de fecha de pago inválido. Utilice AAAA-MM-DD.');
        }

        const amount = parseFloat(record.amount);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('El monto del pago no es un número válido o es menor o igual a cero.');
        }

        // --- 2. FIND THE CORRESPONDING SALE (IN-MEMORY) ---
        const saleKey = `${record.invoiceNumber}_${record.customerIdentification}`;
        const saleInfo = salesMap.get(saleKey);

        if (!saleInfo) {
            throw new Error(`No se encontró una venta con la factura #${record.invoiceNumber} para el cliente ${record.customerIdentification}.`);
        }
        
        const sale = { id: saleInfo.id, ...saleInfo.data } as CreditSale;
        const saleRef = saleInfo.ref;

        // --- 3. DATE INTEGRITY CHECK ---
        const saleDateRaw = sale.saleDate;
        const saleDate = startOfDay(saleDateRaw.toDate ? saleDateRaw.toDate() : new Date(saleDateRaw));
        const payDate = startOfDay(paymentDate);

        if (payDate < saleDate) {
            throw new Error(`La fecha del pago (${format(payDate, 'dd/MM/yyyy')}) no puede ser anterior a la fecha de la venta (${format(saleDate, 'dd/MM/yyyy')}).`);
        }

        // --- 4. PROCESS THE PAYMENT (IN A TRANSACTION FOR SAFETY) ---
        const paymentsCollectionRef = saleRef.collection('payments');
        await firestore.runTransaction(async (transaction) => {
            const currentSaleDoc = await transaction.get(saleRef);
            if (!currentSaleDoc.exists) {
                throw new Error('La venta ya no existe.');
            }
            const currentSaleData = currentSaleDoc.data() as CreditSale;

            const verifiedPaymentsSnap = await transaction.get(paymentsCollectionRef.where('status', '==', 'Verificado'));
            const verifiedPayments = verifiedPaymentsSnap.docs.map(doc => doc.data() as Payment);
            
            const downPaymentAmount = (currentSaleData.downPaymentAmount || 0);
            const totalPaid = verifiedPayments.reduce((sum, p) => sum + p.amount, 0) + downPaymentAmount;
            const pendingBalance = currentSaleData.amount - totalPaid;

            if (amount > pendingBalance + 0.01) {
                throw new Error(`El monto del pago (${amount.toFixed(2)}) es mayor al saldo pendiente (${pendingBalance.toFixed(2)}).`);
            }
            
            let paymentAmountToDistribute = amount;
            const appliedToInstallments: Record<number, number> = {};

            const paymentsByInstallment: Record<number, number> = {};
            verifiedPayments.forEach(p => {
                if (!p.appliedToInstallments) return;
                for (const instNumStr in p.appliedToInstallments) {
                    const installment = parseInt(instNumStr, 10);
                    paymentsByInstallment[installment] = (paymentsByInstallment[installment] || 0) + p.appliedToInstallments[instNumStr];
                }
            });
            
            for (let i = 1; i <= currentSaleData.numberOfInstallments; i++) {
                if (paymentAmountToDistribute <= 0) break;

                const paidForThisInstallment = paymentsByInstallment[i] || 0;
                const pendingOnInstallment = currentSaleData.installmentAmount - paidForThisInstallment;

                if (pendingOnInstallment > 0) {
                    const amountToApply = Math.min(paymentAmountToDistribute, pendingOnInstallment);
                    appliedToInstallments[i] = amountToApply;
                    paymentAmountToDistribute -= amountToApply;
                }
            }

            const newPaymentRef = paymentsCollectionRef.doc();
            transaction.set(newPaymentRef, {
                creditSaleId: sale.id,
                amount: amount,
                paymentDate: Timestamp.fromDate(paymentDate),
                paymentMethod: record.paymentMethod,
                referenceNumber: record.referenceNumber || '',
                status: 'Verificado', // Bulk uploads by vendor are auto-verified
                reportedBy: 'vendor',
                appliedToInstallments: appliedToInstallments,
            });

            const newTotalPaid = totalPaid + amount;
            let newStatus = currentSaleData.status;

            if (newTotalPaid >= currentSaleData.amount - 0.01) {
                newStatus = 'Pagado';
            } else if (currentSaleData.dueDate.toDate() < new Date()) {
                newStatus = 'Vencido';
            } else {
                newStatus = 'Pendiente';
            }
            
            if (newStatus !== currentSaleData.status) {
                transaction.update(saleRef, { status: newStatus });
            }
        });

        processed++;
      } catch (error: any) {
        skipped++;
        errors.push(`Fila ${rowIndex}: ${error.message}`);
      }
    }

    // Save the import report
    await vendorRef.collection('import_reports').add({
        fileName: fileName,
        importType: 'Pagos',
        reportDate: Timestamp.now(),
        processed: processed,
        skipped: skipped,
        errors: errors,
        importedBy: vendorId,
    });

    return { processed, skipped, errors };
  }
);
