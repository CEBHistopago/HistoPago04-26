'use server';

/**
 * @fileOverview A flow for retrieving a customer's credit history across all vendors.
 * - getCustomerHistory - Fetches and aggregates a customer's sales and payments.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { GetCustomerHistoryInputSchema, GetCustomerHistoryOutputSchema, GetCustomerHistoryInput, GetCustomerHistoryOutput, CreditSaleWithPayments, Payment, Installment, CreditSale } from '@/lib/data';
import { addWeeks, addMonths, addQuarters, startOfDay, isAfter, parseISO, addDays } from 'date-fns';

// Flow implementation
export async function getCustomerHistory(
  input: GetCustomerHistoryInput
): Promise<GetCustomerHistoryOutput> {
  return getCustomerHistoryFlow(input);
}

// Helper to serialize any Firestore Timestamps in an object to ISO strings
const serializeTimestamps = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (obj instanceof Timestamp) {
        return obj.toDate().toISOString();
    }
    if (Array.isArray(obj)) {
        return obj.map(serializeTimestamps);
    }
    const newObj: { [key: string]: any } = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            newObj[key] = serializeTimestamps(obj[key]);
        }
    }
    return newObj;
};


const getCustomerHistoryFlow = ai.defineFlow(
  {
    name: 'getCustomerHistoryFlow',
    inputSchema: GetCustomerHistoryInputSchema,
    outputSchema: GetCustomerHistoryOutputSchema,
  },
  async (input) => {
    const { firestore } = await initializeFirebaseAdmin();
    const { customerIdentification, vendorId } = input;
    
    const defaultOutput: GetCustomerHistoryOutput = { 
        history: [], 
        stats: { totalSales: 0, totalAmount: 0, totalPaid: 0, totalDebt: 0, activeCredits: 0, paidCredits: 0, overdueCredits: 0, creditScore: 11.5, pendingConfirmationCount: 0, pendingVerificationCount: 0 }, 
        paymentSchedule: [] 
    };

    let vendorIds: string[] = [];

    if (vendorId) {
      // If a specific vendor is provided, use only that ID
      vendorIds = [vendorId];
    } else {
      // Otherwise, get all vendors from the customer index for a global search
      const customerIndexDoc = await firestore.collection('customer_index').doc(customerIdentification).get();
      if (!customerIndexDoc.exists) {
          return defaultOutput;
      }
      vendorIds = (customerIndexDoc.data() as { vendorIds: string[] }).vendorIds;
    }


    if (!vendorIds || vendorIds.length === 0) {
        return defaultOutput;
    }
    
    let allSalesData: CreditSaleWithPayments[] = [];
    const salesPromises = vendorIds.map(async (vendorId) => {
        const salesSnapshot = await firestore
            .collection('vendors')
            .doc(vendorId)
            .collection('sales')
            .where('customerIdentification', '==', customerIdentification)
            .get();

        if (salesSnapshot.empty) {
            return [];
        }
        
        const vendorDoc = await firestore.collection('vendors').doc(vendorId).get();
        const vendorName = vendorDoc.exists ? vendorDoc.data()?.name : 'Comercio Desconocido';

        const vendorSalesPromises = salesSnapshot.docs.map(async (saleDoc) => {
            const saleData = saleDoc.data() as CreditSale;
            const paymentsSnapshot = await saleDoc.ref.collection('payments').get();
            
            const payments: Payment[] = paymentsSnapshot.docs.map(doc => {
                 const paymentData = doc.data();
                 // FIX: Ensure paymentMethod exists for backwards compatibility
                 if (!paymentData.paymentMethod) {
                    paymentData.paymentMethod = 'Transferencia'; // Default for old records
                 }
                 return {
                    id: doc.id,
                    ...paymentData,
                    paymentDate: serializeTimestamps(paymentData.paymentDate)
                 } as Payment;
            });

            const serializedSale = serializeTimestamps({
                ...saleData,
                id: saleDoc.id,
                vendorName: vendorName,
                createdBy: vendorId,
                payments: payments,
            });
            
            return serializedSale as CreditSaleWithPayments;
        });
        
        return Promise.all(vendorSalesPromises);
    });

    const salesResults = (await Promise.all(salesPromises)).flat();
    allSalesData.push(...salesResults);
    
    allSalesData.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());

    let totalAmount = 0;
    let totalPaid = 0;
    let activeCredits = 0;
    let paidCredits = 0;
    let overdueCredits = 0;
    let pendingConfirmationCount = 0;
    let pendingVerificationCount = 0;
    const paymentSchedule: Installment[] = [];
    const today = startOfDay(new Date());

    let creditScore = 11.5;

    const getGraceDays = (frequency: CreditSale['paymentFrequency']): number => {
        switch (frequency) {
            case 'Semanal': return 1;
            case 'Quincenal': return 2;
            case 'Mensual': return 5;
            case 'Trimestral': return 5; // Assuming same as monthly
            default: return 0;
        }
    };

    for (const sale of allSalesData) {
        // EXCLUDE Administrative closed sales from score and schedule
        if (sale.status === 'Cerrado Administrativamente') {
            continue;
        }

        if (sale.status === 'Pendiente de Confirmación') {
            pendingConfirmationCount++;
            sale.downPaymentAmount = sale.downPaymentAmount || 0;
            sale.totalPaid = sale.totalPaid || 0;
            sale.remainingBalance = sale.amount - (sale.totalPaid || 0);
            sale.paidInstallments = 0;
            sale.pendingInstallments = sale.numberOfInstallments;
        } else {
            const verifiedPayments = sale.payments.filter(p => p.status === 'Verificado');
            pendingVerificationCount += sale.payments.filter(p => p.status === 'Pendiente de Verificación').length;

            let downPayment = 0;
            if (sale.downPaymentType && sale.downPaymentValue && sale.downPaymentValue > 0) {
                downPayment = sale.downPaymentType === 'Porcentaje'
                    ? sale.amount * (sale.downPaymentValue / 100)
                    : sale.downPaymentValue;
            }
            sale.downPaymentAmount = parseFloat(downPayment.toFixed(2));
            
            const installmentPaymentsTotal = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);
            const totalPaidForSale = parseFloat((installmentPaymentsTotal + downPayment).toFixed(2));
            const balance = sale.amount - totalPaidForSale;
            
            sale.totalPaid = totalPaidForSale;
            sale.remainingBalance = balance > 0.01 ? balance : 0;
            
            const saleIsFullyPaid = sale.remainingBalance <= 0.01;

            totalAmount += sale.amount;
            totalPaid += totalPaidForSale;
            
            const paymentsByInstallment: Record<number, { amount: number; latestPaymentDate?: Date }> = {};
            verifiedPayments.forEach(p => {
              if (!p.appliedToInstallments) return;
              for (const instNumStr in p.appliedToInstallments) {
                const installment = parseInt(instNumStr, 10);
                if (!paymentsByInstallment[installment]) {
                    paymentsByInstallment[installment] = { amount: 0 };
                }
                paymentsByInstallment[installment].amount += p.appliedToInstallments[instNumStr];
                const paymentDate = parseISO(p.paymentDate);
                if (!paymentsByInstallment[installment].latestPaymentDate || isAfter(paymentDate, paymentsByInstallment[installment].latestPaymentDate!)) {
                    paymentsByInstallment[installment].latestPaymentDate = paymentDate;
                }
              }
            });

            let paidInstallmentsCount = 0;
            let saleHasDefault = false;
            
            const graceDays = getGraceDays(sale.paymentFrequency);
            
            if (saleIsFullyPaid) {
                paidInstallmentsCount = sale.numberOfInstallments;
                 for (let i = 1; i <= sale.numberOfInstallments; i++) {
                    if (paymentsByInstallment[i]) {
                        let dueDate: Date;
                         const index = i - 1;
                         // Correction for parsing: Treat ISO as UTC but handle as Calendar date
                         const rawDate = parseISO(sale.firstPaymentDate);
                         const offset = rawDate.getTimezoneOffset() * 60000;
                         const firstPaymentDate = new Date(rawDate.getTime() + offset);

                         switch (sale.paymentFrequency) {
                            case 'Semanal': dueDate = addWeeks(firstPaymentDate, index); break;
                            case 'Quincenal': dueDate = addWeeks(firstPaymentDate, index * 2); break;
                            case 'Mensual': dueDate = addMonths(firstPaymentDate, index); break;
                            case 'Trimestral': dueDate = addQuarters(firstPaymentDate, index); break;
                            default: continue;
                        }
                        const dueDateWithGrace = addDays(startOfDay(dueDate), graceDays);
                        const latestPaymentDate = paymentsByInstallment[i].latestPaymentDate;

                        if (latestPaymentDate && isAfter(startOfDay(latestPaymentDate), dueDateWithGrace)) {
                             saleHasDefault = true;
                        }
                    }
                }
            } else if (sale.firstPaymentDate) {
                const rawDate = parseISO(sale.firstPaymentDate);
                const offset = rawDate.getTimezoneOffset() * 60000;
                const firstPaymentDate = new Date(rawDate.getTime() + offset);

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
                    
                    const dueDateWithGrace = addDays(startOfDay(dueDate), graceDays);
                    const paidForInstallment = paymentsByInstallment[i]?.amount || 0;
                    const installmentIsPaid = paidForInstallment >= sale.installmentAmount - 0.01;
                    
                    if (installmentIsPaid) {
                        paidInstallmentsCount++;
                        const latestPaymentDate = paymentsByInstallment[i].latestPaymentDate;
                        if (latestPaymentDate && isAfter(startOfDay(latestPaymentDate), dueDateWithGrace)) {
                            creditScore -= 1.0;
                            saleHasDefault = true;
                        } else {
                            creditScore += 0.40;
                        }
                    } else if (sale.status !== 'Solicitud de Suspension') { // Only add to schedule if not requested for suspension
                         const isOverdue = isAfter(today, dueDateWithGrace);
                         if (isOverdue) {
                             creditScore -= 1.0;
                             saleHasDefault = true;
                         }
                         const pendingForInstallment = parseFloat((sale.installmentAmount - paidForInstallment).toFixed(2));
                         if (pendingForInstallment > 0) {
                            paymentSchedule.push({
                                saleId: sale.id,
                                invoiceNumber: sale.invoiceNumber,
                                vendorName: sale.vendorName || 'Comercio Desconocido',
                                installmentNumber: i,
                                dueDate: dueDate.toISOString(),
                                amount: pendingForInstallment,
                                status: isOverdue ? 'Vencido' : 'Pendiente'
                            });
                         }
                    }
                }
            }
            
            sale.paidInstallments = paidInstallmentsCount;

            if (saleIsFullyPaid) {
                paidCredits++;
                sale.status = 'Pagado';
                sale.pendingInstallments = 0; 
                if (!saleHasDefault) {
                    creditScore += 0.60;
                }
            } else {
                activeCredits++;
                sale.pendingInstallments = sale.numberOfInstallments - paidInstallmentsCount;
                const finalDueDateSrc = sale.dueDate ? parseISO(sale.dueDate) : new Date(0);
                const finalOffset = finalDueDateSrc.getTimezoneOffset() * 60000;
                const finalDueDate = new Date(finalDueDateSrc.getTime() + finalOffset);

                const finalDueDateWithGrace = addDays(startOfDay(finalDueDate), graceDays);

                if (sale.status === 'Solicitud de Suspension') {
                    // Stay in this status
                } else if (isAfter(today, finalDueDateWithGrace)) {
                    sale.status = 'Vencido';
                    overdueCredits++;
                    creditScore -= 2.4;
                } else {
                    sale.status = 'Pendiente';
                }
            }
        }
    }
    
    const totalSales = allSalesData.filter(s => s.status !== 'Pendiente de Confirmación' && s.status !== 'Cerrado Administrativamente').length;
    const totalDebt = parseFloat((totalAmount - totalPaid).toFixed(2));

    if (totalSales === 0 && pendingConfirmationCount === 0) {
        creditScore = 11.5;
    } else {
        creditScore = Math.max(0, Math.min(20, creditScore));
    }
    
    paymentSchedule.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    
    if (isNaN(creditScore)) {
        console.error("Credit score calculation resulted in NaN. Defaulting to 11.5", { totalSales, pendingConfirmationCount });
        creditScore = 11.5;
    }
    
    return {
      history: allSalesData,
      stats: {
        totalSales,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        totalDebt: totalDebt > 0.01 ? totalDebt : 0,
        activeCredits,
        paidCredits,
        overdueCredits,
        creditScore: parseFloat(creditScore.toFixed(1)),
        pendingConfirmationCount,
        pendingVerificationCount,
      },
      paymentSchedule,
    };
  }
);
