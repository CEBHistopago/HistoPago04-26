'use server';

/**
 * @fileOverview A flow for efficiently calculating dashboard statistics for a vendor.
 * - getDashboardStats: Fetches sales and payments to generate key performance indicators.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { DashboardStatsSchema, CreditSale, Payment, Vendor } from '@/lib/data';
import { Timestamp } from 'firebase-admin/firestore';
import { addWeeks, addMonths, addQuarters, parseISO, startOfDay, isAfter, format } from 'date-fns';

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

// This is the exported function that the client will call.
export async function getDashboardStats(vendorId: string): Promise<DashboardStats> {
  return getDashboardStatsFlow(vendorId);
}

const getDashboardStatsFlow = ai.defineFlow(
  {
    name: 'getDashboardStatsFlow',
    inputSchema: z.string().describe("The UID of the vendor."),
    outputSchema: DashboardStatsSchema,
  },
  async (vendorId) => {
    try {
        const { firestore } = await initializeFirebaseAdmin();
        const vendorRef = firestore.collection('vendors').doc(vendorId);

        const [vendorSnapshot, salesSnapshot] = await Promise.all([
            vendorRef.get(),
            vendorRef.collection('sales').get(),
        ]);
        
        const rawPlan = (vendorSnapshot.data() as Vendor)?.plan;
        const vendorPlan = rawPlan === 'HistoAlquiler' ? 'HistoAlquiler' : 'HistoGestion';

        if (salesSnapshot.empty) {
            return {
                totalRevenue: 0,
                activeCredits: 0,
                totalSales: 0,
                overdueCount: 0,
                totalReceivableToDate: 0,
                pendingConfirmationCount: 0,
                vendorPlan: vendorPlan,
                dailyManagementStats: { clientsContacted: 0, notifications: { whatsapp: 0, sms: 0, email: 0, push: 0 } },
                totalClients: 0,
            };
        }

        let totalReceivableToDate = 0;
        let activeCredits = 0;
        let overdueCount = 0;
        let pendingConfirmationCount = 0;
        let totalSales = 0;
        let totalRevenue = 0;
        let totalClients = new Set<string>();
        const today = startOfDay(new Date());

        const sales = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CreditSale));

        for (const sale of sales) {
            // EXCLUDE suspended or administrative closed sales from active KPIs
            if (sale.status === 'Solicitud de Suspension' || sale.status === 'Cerrado Administrativamente') {
                continue;
            }

            if (sale.status === 'Pendiente de Confirmación') {
                pendingConfirmationCount++;
                continue; // Skip to the next sale
            }
            
            // --- Data Integrity Check ---
            const saleAmount = typeof sale.amount === 'number' ? sale.amount : 0;
            if (saleAmount === 0) {
                 console.warn(`[getDashboardStatsFlow] Sale ${sale.id} has zero or invalid amount. Excluding from calculations.`);
                 continue;
            }
            
            totalSales++;
            totalRevenue += saleAmount;
            if(sale.customerIdentification) {
                totalClients.add(sale.customerIdentification);
            }

            const paymentsSnapshot = await vendorRef.collection('sales').doc(sale.id).collection('payments').where('status', '==', 'Verificado').get();
            const salePayments = paymentsSnapshot.docs.map(doc => doc.data() as Payment);

            const downPaymentAmount = (typeof sale.downPaymentAmount === 'number' ? sale.downPaymentAmount : 0);
            const totalPaidForSale = salePayments.reduce((sum, p) => sum + p.amount, 0) + downPaymentAmount;
            const balance = saleAmount - totalPaidForSale;
            
            if (balance <= 0.01) {
                continue; // Sale is paid, skip to next
            }
            
            activeCredits++;
            
            let isOverdue = false;
            if (sale.firstPaymentDate && sale.numberOfInstallments) {
                const saleInstallmentAmount = typeof sale.installmentAmount === 'number' ? sale.installmentAmount : 0;
                if(saleInstallmentAmount === 0) {
                     console.warn(`[getDashboardStatsFlow] Sale ${sale.id} has zero or invalid installmentAmount. Cannot process installments.`);
                     continue;
                }

                const paymentsByInstallment: Record<number, number> = {};
                salePayments.forEach(p => {
                    if (p.appliedToInstallments) {
                        for (const instNumStr in p.appliedToInstallments) {
                            const installment = parseInt(instNumStr, 10);
                            paymentsByInstallment[installment] = (paymentsByInstallment[installment] || 0) + p.appliedToInstallments[instNumStr];
                        }
                    }
                });
                
                const firstPaymentDateSrc = sale.firstPaymentDate.toDate ? sale.firstPaymentDate.toDate() : new Date(sale.firstPaymentDate);

                for (let i = 1; i <= sale.numberOfInstallments; i++) {
                    const amountPaidForInstallment = paymentsByInstallment[i] || 0;
                    const pendingForInstallment = saleInstallmentAmount - amountPaidForInstallment;

                    if (pendingForInstallment > 0.01) {
                        let installmentDueDate: Date;
                        const index = i - 1;
                        switch (sale.paymentFrequency) {
                            case 'Semanal': installmentDueDate = addWeeks(firstPaymentDateSrc, index); break;
                            case 'Quincenal': installmentDueDate = addWeeks(firstPaymentDateSrc, index * 2); break;
                            case 'Mensual': installmentDueDate = addMonths(firstPaymentDateSrc, index); break;
                            case 'Trimestral': installmentDueDate = addQuarters(firstPaymentDateSrc, index); break;
                            default: continue;
                        }

                        if (startOfDay(installmentDueDate) < today) {
                            isOverdue = true;
                            totalReceivableToDate += pendingForInstallment;
                        }
                    }
                }
            }
            
            if (isOverdue) {
                overdueCount++;
            }
        }
        
        let dailyManagementStats = { clientsContacted: 0, notifications: { whatsapp: 0, sms: 0, email: 0, push: 0 }};
        try {
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const dailyStatsRef = vendorRef.collection('daily_management_stats').doc(todayStr);
            const dailyStatsSnap = await dailyStatsRef.get();
            if (dailyStatsSnap.exists()) {
                const data = dailyStatsSnap.data();
                
                let clientsCount = 0;
                if (data?.contactedClientIds && Array.isArray(data.contactedClientIds)) {
                    clientsCount = data.contactedClientIds.length;
                } else {
                    // Fallback for old data structure
                    clientsCount = data?.clientsContactedCount || 0;
                }

                dailyManagementStats = {
                    clientsContacted: clientsCount,
                    notifications: data?.notifications || { whatsapp: 0, sms: 0, email: 0, push: 0 },
                };
            }
        } catch (e) {
            console.warn(`[getDashboardStatsFlow] Could not fetch daily management stats.`, e);
        }

        return {
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            activeCredits,
            totalSales,
            overdueCount,
            totalReceivableToDate: parseFloat(totalReceivableToDate.toFixed(2)),
            pendingConfirmationCount,
            vendorPlan: vendorPlan,
            dailyManagementStats,
            totalClients: totalClients.size,
        };

    } catch (error) {
        console.error("Error in getDashboardStatsFlow:", error);
        // Return a default object with the correct structure on error
        return {
            totalRevenue: 0,
            activeCredits: 0,
            totalSales: 0,
            overdueCount: 0,
            totalReceivableToDate: 0,
            pendingConfirmationCount: 0,
            vendorPlan: 'HistoGestion',
            dailyManagementStats: { clientsContacted: 0, notifications: { whatsapp: 0, sms: 0, email: 0, push: 0 } },
            totalClients: 0,
        };
    }
  }
);
