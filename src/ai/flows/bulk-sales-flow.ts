'use server';
/**
 * @fileOverview A server-side flow for processing bulk sales from a CSV file.
 * - processBulkSales: Reads sales data, validates it, and creates records in Firestore.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { CreateSaleSchema, CreateSaleValues } from '@/lib/data';
import { addDays, addWeeks, addMonths, addQuarters, isValid, parseISO } from 'date-fns';

const BulkSalesInputSchema = z.object({
  vendorId: z.string(),
  salesData: z.array(z.any()),
  fileName: z.string(),
});

const BulkSalesOutputSchema = z.object({
  processed: z.number(),
  skipped: z.number(),
  errors: z.array(z.string()),
});

export async function processBulkSales(
  input: z.infer<typeof BulkSalesInputSchema>
): Promise<z.infer<typeof BulkSalesOutputSchema>> {
  return processBulkSalesFlow(input);
}

const processBulkSalesFlow = ai.defineFlow(
  {
    name: 'processBulkSalesFlow',
    inputSchema: BulkSalesInputSchema,
    outputSchema: BulkSalesOutputSchema,
  },
  async ({ vendorId, salesData, fileName }) => {
    const { firestore } = await initializeFirebaseAdmin();
    const bulkWriter = firestore.bulkWriter();
    let processed = 0;
    let skipped = 0;
    const errors: string[] = [];

    const vendorRef = firestore.collection('vendors').doc(vendorId);
    const salesCollectionRef = vendorRef.collection('sales');
    
    // --- OPTIMIZATION: Pre-fetch existing sales and customers ---
    const existingSalesSnapshot = await salesCollectionRef.get();
    const existingSales = new Set(existingSalesSnapshot.docs.map(doc => `${doc.data().customerIdentification}_${doc.data().invoiceNumber}`));

    const allCustomerIdsInFile = [...new Set(salesData.map(r => r.idPrefix && r.idNumber ? `${r.idPrefix}-${r.idNumber}` : null).filter(Boolean))];
    const existingCustomers = new Set<string>();

    if (allCustomerIdsInFile.length > 0) {
      const chunks = [];
      for (let i = 0; i < allCustomerIdsInFile.length; i += 30) {
        chunks.push(allCustomerIdsInFile.slice(i, i + 30));
      }
      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        const q = await firestore.collection('customers').where('identificationNumber', 'in', chunk).get();
        q.forEach(doc => existingCustomers.add(doc.data().identificationNumber));
      }
    }
    // --- END OPTIMIZATION ---
    
    const newCustomersToCreate = new Map<string, any>();
    const customerIndexToUpdate = new Set<string>();


    for (const [index, record] of salesData.entries()) {
      const rowIndex = index + 2; // For user-friendly error messages (1-based index + header)
      
      try {
        // --- DATA PRE-VALIDATION AND COERCION ---
        const requiredFields = ['customerName', 'idPrefix', 'idNumber', 'invoiceNumber', 'amount', 'numberOfInstallments', 'paymentFrequency', 'saleDate', 'firstPaymentDate'];
        for (const field of requiredFields) {
            if (!record[field] || String(record[field]).trim() === '') {
                throw new Error(`Campo requerido '${field}' está vacío.`);
            }
        }
        
        // FIX: Force interpretation as local midnight to avoid UTC shift / off-by-one day errors
        const saleDate = new Date(`${record.saleDate}T00:00:00`);
        const firstPaymentDate = new Date(`${record.firstPaymentDate}T00:00:00`);

        if (!isValid(saleDate) || !isValid(firstPaymentDate)) {
             throw new Error('Formato de fecha inválido. Utilice AAAA-MM-DD.');
        }
        
        const fullIdentification = `${record.idPrefix}-${record.idNumber}`;

        // --- DUPLICATE CHECK (IN-MEMORY) ---
        if (existingSales.has(`${fullIdentification}_${record.invoiceNumber}`)) {
            throw new Error(`Ya existe una venta para el cliente ${fullIdentification} con el número de factura ${record.invoiceNumber}.`);
        }

        // --- DATA PROCESSING AND CALCULATIONS ---
        const amount = parseFloat(record.amount);
        const downPaymentValue = parseFloat(record.downPaymentValue || '0');
        const numberOfInstallments = parseInt(record.numberOfInstallments, 10);

        if (isNaN(amount) || isNaN(downPaymentValue) || isNaN(numberOfInstallments)) {
             throw new Error('Los campos de monto, valor de inicial o número de cuotas no son números válidos.');
        }
        
        const downPaymentAmount = record.downPaymentType === 'Porcentaje'
            ? amount * (downPaymentValue / 100)
            : downPaymentValue;

        const remainingBalance = amount - downPaymentAmount;
        const installmentAmount = numberOfInstallments > 0
            ? remainingBalance / numberOfInstallments
            : 0;

        let finalDueDate: Date;
        const installments = numberOfInstallments - 1;
        switch (record.paymentFrequency) {
            case 'Semanal': finalDueDate = addWeeks(firstPaymentDate, installments); break;
            case 'Quincenal': finalDueDate = addWeeks(firstPaymentDate, installments * 2); break;
            case 'Mensual': finalDueDate = addMonths(firstPaymentDate, installments); break;
            case 'Trimestral': finalDueDate = addQuarters(firstPaymentDate, installments); break;
            default: throw new Error(`Frecuencia de pago desconocida: ${record.paymentFrequency}`);
        }

        const fullPhoneNumber = record.phonePrefix && record.phoneNumber ? `+58${record.phonePrefix}${record.phoneNumber}` : '';

        // --- FINAL VALIDATION WITH ZOD ---
        const saleDataToValidate: CreateSaleValues = {
            ...record,
            amount: amount,
            downPaymentValue: downPaymentValue,
            numberOfInstallments: numberOfInstallments,
            remainingBalance: parseFloat(remainingBalance.toFixed(2)),
            installmentAmount: parseFloat(installmentAmount.toFixed(2)),
            dueDate: finalDueDate.toISOString().split('T')[0],
            customerEmail: record.customerEmail || '',
            salesPerson: record.salesPerson || '', 
        };
        CreateSaleSchema.parse(saleDataToValidate);

        // --- PREPARE FOR FIRESTORE ---
        const dataToSave = {
          ...saleDataToValidate,
          downPaymentAmount: parseFloat(downPaymentAmount.toFixed(2)),
          customerIdentification: fullIdentification,
          customerPhone: fullPhoneNumber,
          createdBy: vendorId,
          status: 'Pendiente', 
          saleDate: Timestamp.fromDate(saleDate),
          firstPaymentDate: Timestamp.fromDate(firstPaymentDate),
          dueDate: Timestamp.fromDate(finalDueDate),
        };
        
        delete (dataToSave as any).idPrefix;
        delete (dataToSave as any).idNumber;
        delete (dataToSave as any).phonePrefix;
        delete (dataToSave as any).phoneNumber;
        delete (dataToSave as any).agreed;

        // --- QUEUE DATABASE OPERATIONS ---
        const newSaleRef = salesCollectionRef.doc();
        bulkWriter.create(newSaleRef, dataToSave);
        
        customerIndexToUpdate.add(fullIdentification);

        if (!existingCustomers.has(fullIdentification) && !newCustomersToCreate.has(fullIdentification)) {
            newCustomersToCreate.set(fullIdentification, {
                name: record.customerName,
                email: record.customerEmail || '',
                identificationNumber: fullIdentification,
                role: 'customer'
            });
        }
        
        processed++;

      } catch (error: any) {
        skipped++;
        if (error instanceof z.ZodError) {
             const formattedErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
             errors.push(`Fila ${rowIndex}: ${formattedErrors}`);
        } else {
             errors.push(`Fila ${rowIndex}: ${error.message}`);
        }
      }
    }

    // --- EXECUTE BATCH WRITES ---
    for (const customerData of newCustomersToCreate.values()) {
        const customerDocRef = firestore.collection('customers').doc();
        bulkWriter.create(customerDocRef, customerData);
    }
    
    for (const customerId of customerIndexToUpdate) {
        const customerIndexRef = firestore.collection('customer_index').doc(customerId);
        bulkWriter.set(customerIndexRef, { vendorIds: FieldValue.arrayUnion(vendorId) }, { merge: true });
    }

    // Save the import report
    const reportRef = vendorRef.collection('import_reports').doc();
    bulkWriter.create(reportRef, {
        fileName: fileName,
        importType: 'Ventas',
        reportDate: Timestamp.now(),
        processed: processed,
        skipped: skipped,
        errors: errors,
        importedBy: vendorId,
    });
    
    await bulkWriter.close();

    return { processed, skipped, errors };
  }
);
