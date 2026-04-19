'use server';

/**
 * @fileOverview A flow for summarizing client credit data for a vendor.
 * - summarizeClients - Fetches and aggregates sales and payments for all clients of a vendor.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { addWeeks, addMonths, addQuarters } from 'date-fns';
import { CreditSale, Payment, ClientSummarySchema } from '@/lib/data';

const SummarizeClientsInputSchema = z.string().describe("The UID of the vendor.");
const SummarizeClientsOutputSchema = z.array(ClientSummarySchema);

export type SummarizeClientsOutput = z.infer<typeof SummarizeClientsOutputSchema>;

// This is the exported function that the client will call.
export async function summarizeClients(vendorId: string): Promise<SummarizeClientsOutput> {
  return summarizeClientsFlow(vendorId);
}

const summarizeClientsFlow = ai.defineFlow(
  {
    name: 'summarizeClientsFlow',
    inputSchema: SummarizeClientsInputSchema,
    outputSchema: SummarizeClientsOutputSchema,
  },
  async (vendorId) => {
    const { firestore } = await initializeFirebaseAdmin();
    
    // Step 1: Get all sales for the specific vendor.
    const salesSnapshot = await firestore.collection('vendors').doc(vendorId).collection('sales').get();

    if (salesSnapshot.empty) {
        return [];
    }
    
    const sales = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreditSale));
    
    // Step 2: Get all payments for this vendor's sales. This is more efficient.
    const paymentsBySale = new Map<string, Payment[]>();
    const salesIds = sales.map(s => s.id);
    
    for (const saleId of salesIds) {
        const paymentsSnapshot = await firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId).collection('payments').where('status', '==', 'Verificado').get();
        if (!paymentsSnapshot.empty) {
            paymentsBySale.set(saleId, paymentsSnapshot.docs.map(doc => doc.data() as Payment));
        }
    }


    // Step 3: Group sales by client ID for efficient processing
    const salesByClient = new Map<string, CreditSale[]>();
    sales.forEach(sale => {
        const clientKey = sale.customerIdentification;
        if (!salesByClient.has(clientKey)) {
            salesByClient.set(clientKey, []);
        }
        salesByClient.get(clientKey)!.push(sale);
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allClientsData: SummarizeClientsOutput = [];

    // Process each client
    for (const [clientId, clientSales] of salesByClient.entries()) {
        
        let clientHasOverdueInstallment = false;
        let totalCreditAmount = 0;
        let totalPaid = 0;
        let activeCredits = 0;
        const clientName = clientSales[0].customerName;

        for (const sale of clientSales) {
            // EXCLUDE administrative closed sales from summary
            if (sale.status === 'Cerrado Administrativamente') continue;

            totalCreditAmount += sale.amount;
            
            const downPaymentAmount = (sale.downPaymentAmount || 0);

            const salePayments = paymentsBySale.get(sale.id) || [];
            const paidForThisSale = salePayments.reduce((sum, p) => sum + p.amount, 0) + downPaymentAmount;
            totalPaid += paidForThisSale;
            
            const balance = sale.amount - paidForThisSale;
            if (balance > 0.01) {
                 activeCredits++;
            }
            
            if (clientHasOverdueInstallment || balance <= 0.01 || sale.status === 'Solicitud de Suspension') continue; 

            const paymentsByInstallment = salePayments.reduce((acc, p) => {
                if (p.appliedToInstallments) {
                    for (const instNumStr in p.appliedToInstallments) {
                        const installment = parseInt(instNumStr, 10);
                        acc[installment] = (acc[installment] || 0) + p.appliedToInstallments[instNumStr];
                    }
                }
                return acc;
            }, {} as Record<number, number>);

            if (!sale.firstPaymentDate || !sale.numberOfInstallments) continue;

            const firstPaymentDateSrc = sale.firstPaymentDate.toDate ? sale.firstPaymentDate.toDate() : new Date(sale.firstPaymentDate);
            const offset = firstPaymentDateSrc.getTimezoneOffset() * 60000;
            const firstPaymentDate = new Date(firstPaymentDateSrc.getTime() + offset);

            for (let i = 1; i <= sale.numberOfInstallments; i++) {
                let dueDate: Date;
                const index = i - 1;
                switch (sale.paymentFrequency) {
                    case 'Semanal': dueDate = addWeeks(firstPaymentDate, index); break;
                    case 'Quincenal': dueDate = addWeeks(firstPaymentDate, index * 2); break;
                    case 'Mensual': dueDate = addMonths(firstPaymentDate, index); break;
                    case 'Trimestral': dueDate = addQuarters(firstPaymentDate, index); break;
                    default: dueDate = new Date();
                }
                dueDate.setHours(0, 0, 0, 0);

                const amountPaidForInstallment = paymentsByInstallment[i] || 0;
                const pendingForInstallment = sale.installmentAmount - amountPaidForInstallment;

                if (dueDate <= today && pendingForInstallment > 0.01) {
                    clientHasOverdueInstallment = true;
                    break;
                }
            }
        }
        
        const clientTotalPending = totalCreditAmount - totalPaid;

        allClientsData.push({
            id: clientId,
            name: clientName,
            activeCredits: activeCredits,
            totalCreditAmount: parseFloat(totalCreditAmount.toFixed(2)),
            totalPaid: parseFloat(totalPaid.toFixed(2)),
            pendingBalance: parseFloat(clientTotalPending.toFixed(2)),
            status: clientHasOverdueInstallment ? 'Vencido' : 'Al Día',
        });
    }
    
    return allClientsData;
  }
);
