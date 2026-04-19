'use server';
/**
 * @fileOverview Server-side flows for generating vendor-specific reports.
 * - getAgingReport: Generates the accounts receivable aging report.
 * - getCashFlowReport: Generates the cash flow report (income from payments).
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CreditSale, Payment } from '@/lib/data';
import { addWeeks, addMonths, addQuarters, differenceInDays, startOfDay } from 'date-fns';

// ****** AGING REPORT FLOW ******

const AgingReportDataSchema = z.object({
    customerName: z.string(),
    customerIdentification: z.string(),
    customerEmail: z.string().optional().nullable(),
    customerPhone: z.string().optional(),
    totalDue: z.number(),
    salesCount: z.number(),
    current: z.number(),
    days1_30: z.number(),
    days31_60: z.number(),
    days61_90: z.number(),
    days91_plus: z.number(),
    salesHistory: z.array(z.object({
        invoiceNumber: z.string(),
        remainingBalance: z.number(),
    })),
    nextInstallmentAmount: z.number(),
});

const AgingReportOutputSchema = z.array(AgingReportDataSchema);

export async function getAgingReport(
  input: { vendorId: string; reportDate: string }
): Promise<z.infer<typeof AgingReportOutputSchema>> {
  return getAgingReportFlow(input);
}

const getAgingReportFlow = ai.defineFlow(
  {
    name: 'getAgingReportFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        reportDate: z.string(),
    }),
    outputSchema: AgingReportOutputSchema,
  },
  async ({ vendorId, reportDate }) => {
    
    const { firestore } = await initializeFirebaseAdmin();

    try {
        const salesSnapshot = await firestore.collection('vendors').doc(vendorId).collection('sales').get();
        
        const allSales = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreditSale));

        const salesByCustomer = new Map<string, CreditSale[]>();
        allSales.forEach(sale => {
            if (!sale.customerIdentification) return;
            if (!salesByCustomer.has(sale.customerIdentification)) {
                salesByCustomer.set(sale.customerIdentification, []);
            }
            salesByCustomer.get(sale.customerIdentification)!.push(sale);
        });

        const asOfDate = startOfDay(new Date(reportDate + 'T00:00:00'));

        const results = await Promise.all(Array.from(salesByCustomer.entries()).map(async ([customerId, customerSales]) => {
            const clientReport = {
                customerName: customerSales[0].customerName,
                customerIdentification: customerId,
                customerEmail: customerSales[0].customerEmail,
                customerPhone: customerSales[0].customerPhone,
                totalDue: 0,
                salesCount: 0,
                current: 0,
                days1_30: 0,
                days31_60: 0,
                days61_90: 0,
                days91_plus: 0,
                salesHistory: [] as { invoiceNumber: string, remainingBalance: number }[],
                nextInstallmentAmount: 0,
            };

            let uniqueSalesCount = 0;

            for (const sale of customerSales) {
                // Ignorar ventas posteriores a la fecha del reporte o cerradas
                if (sale.saleDate.toDate() > asOfDate) continue;
                if (sale.status === 'Cerrado Administrativamente') continue;

                // Obtener pagos verificados hasta la fecha del reporte
                const paymentsSnapshot = await firestore.collection('vendors').doc(vendorId).collection('sales').doc(sale.id).collection('payments')
                    .where('status', '==', 'Verificado')
                    .get();

                const relevantPayments = paymentsSnapshot.docs
                    .map(doc => doc.data() as Payment)
                    .filter(p => p.paymentDate.toDate() <= asOfDate);

                const totalPaidOnSale = relevantPayments.reduce((sum, p) => sum + p.amount, 0) + (sale.downPaymentAmount || 0);
                const remainingBalance = sale.amount - totalPaidOnSale;

                if (remainingBalance <= 0.01) continue;

                uniqueSalesCount++;
                clientReport.salesHistory.push({
                    invoiceNumber: sale.invoiceNumber,
                    remainingBalance: remainingBalance,
                });
                
                if (!sale.firstPaymentDate || !sale.numberOfInstallments) continue;

                const firstPaymentDate = sale.firstPaymentDate.toDate();
                const paymentsByInstallment: Record<number, number> = {};
                relevantPayments.forEach(p => {
                    if (!p.appliedToInstallments) return;
                    for (const instNumStr in p.appliedToInstallments) {
                        const installment = parseInt(instNumStr, 10);
                        paymentsByInstallment[installment] = (paymentsByInstallment[installment] || 0) + p.appliedToInstallments[instNumStr];
                    }
                });

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
                    
                    const dueDateStart = startOfDay(dueDate);
                    const paidForInstallment = paymentsByInstallment[i] || 0;
                    const dueOnInstallment = sale.installmentAmount - paidForInstallment;

                    if (dueOnInstallment > 0.01) {
                        clientReport.totalDue += dueOnInstallment;
                        
                        if (dueDateStart > asOfDate) {
                            clientReport.current += dueOnInstallment;
                        } else {
                            const daysOverdue = differenceInDays(asOfDate, dueDateStart);
                            if (daysOverdue < 1) { 
                                clientReport.current += dueOnInstallment;
                            } else if (daysOverdue <= 30) {
                                clientReport.days1_30 += dueOnInstallment;
                            } else if (daysOverdue <= 60) {
                                clientReport.days31_60 += dueOnInstallment;
                            } else if (daysOverdue <= 90) {
                                clientReport.days61_90 += dueOnInstallment;
                            } else {
                                clientReport.days91_plus += dueOnInstallment;
                            }
                        }
                    }
                }
            }

            if (clientReport.totalDue > 0.01) {
                clientReport.salesCount = uniqueSalesCount;
                return clientReport;
            }
            return null;
        }));

        return results.filter(r => r !== null) as z.infer<typeof AgingReportOutputSchema>;

    } catch (error: any) {
        console.error("Error generating aging report flow:", error);
        throw new Error('No se pudo generar el reporte de antigüedad de saldos en el servidor.');
    }
  }
);


// ****** CASH FLOW REPORT FLOW ******

const CashFlowEntrySchema = z.object({
    id: z.string(),
    transactionDate: z.string(),
    customerName: z.string(),
    invoiceNumber: z.string(),
    creditSaleId: z.string(),
    amount: z.number(),
    concept: z.string(),
});

const CashFlowOutputSchema = z.object({
    totalTransactionsCount: z.number(),
    totalAmountReceived: z.number(),
    transactions: z.array(CashFlowEntrySchema),
});

export async function getCashFlowReport(input: { vendorId: string; startDate: string; endDate: string }): Promise<z.infer<typeof CashFlowOutputSchema>> {
    return getCashFlowReportFlow(input);
}

const getCashFlowReportFlow = ai.defineFlow({
    name: 'getCashFlowReportFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
    }),
    outputSchema: CashFlowOutputSchema,
}, async ({ vendorId, startDate, endDate }) => {
    const { firestore } = await initializeFirebaseAdmin();

    try {
        const start = new Date(`${startDate}T00:00:00Z`);
        const end = new Date(`${endDate}T23:59:59Z`);

        const vendorRef = firestore.collection('vendors').doc(vendorId);
        const salesSnapshot = await vendorRef.collection('sales').get();
        
        const allTransactions: z.infer<typeof CashFlowEntrySchema>[] = [];

        for (const saleDoc of salesSnapshot.docs) {
            const sale = { id: saleDoc.id, ...saleDoc.data() } as CreditSale;
            const saleDate = sale.saleDate.toDate();

            // 1. Pago Inicial (Down Payment)
            const downPaymentAmount = sale.downPaymentAmount || 0;
            if (saleDate >= start && saleDate <= end && downPaymentAmount > 0) {
                allTransactions.push({
                    id: `${sale.id}-dp`,
                    transactionDate: sale.saleDate.toDate().toISOString(),
                    customerName: sale.customerName,
                    invoiceNumber: sale.invoiceNumber,
                    creditSaleId: sale.id,
                    amount: downPaymentAmount,
                    concept: 'Inicial de Factura',
                });
            }

            // 2. Pagos Verificados
            const paymentsSnapshot = await saleDoc.ref.collection('payments')
                .where('status', '==', 'Verificado')
                .get();
            
            paymentsSnapshot.forEach(pDoc => {
                const p = pDoc.data() as Payment;
                const pDate = p.paymentDate.toDate();

                if (pDate >= start && pDate <= end) {
                    allTransactions.push({
                        id: pDoc.id,
                        transactionDate: pDate.toISOString(),
                        customerName: sale.customerName,
                        invoiceNumber: sale.invoiceNumber,
                        creditSaleId: sale.id,
                        amount: p.amount,
                        concept: 'Pago Cuota',
                    });
                }
            });
        }

        allTransactions.sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime());
        
        const totalAmount = allTransactions.reduce((sum, t) => sum + t.amount, 0);

        return {
            totalTransactionsCount: allTransactions.length,
            totalAmountReceived: totalAmount,
            transactions: allTransactions,
        };

    } catch (error: any) {
        console.error("Error generating cash flow report flow:", error);
        throw new Error('Error al generar el reporte de cobros en el servidor.');
    }
});