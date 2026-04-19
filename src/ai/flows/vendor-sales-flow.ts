'use server';
/**
 * @fileOverview Server-side flows for vendor-specific sales and payment operations.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { z } from 'zod';
import { CreateSaleSchema, CreatePaymentSchema, Customer, Payment, CreditSale, Vendor, CreditSaleSchema } from '@/lib/data';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { addWeeks, addMonths, addQuarters, parseISO, isValid, startOfDay, format } from 'date-fns';
import { sendReminderEmail } from './send-reminder-email-flow';
import { sendPushNotification } from './send-push-notification-flow';


// ****** GENERIC SUCCESS/FAILURE OUTPUT ******
const FlowOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  id: z.string().optional(),
  saleStatus: z.string().optional(),
  remainingBalance: z.number().optional(),
});


// ****** CREATE SALE FLOW ******

const CreateSaleInputSchema = z.object({
  vendorId: z.string(),
  saleData: CreateSaleSchema,
});

export async function createSale(
  input: z.infer<typeof CreateSaleInputSchema>
): Promise<z.infer<typeof FlowOutputSchema>> {
  return createSaleFlow(input);
}

const createSaleFlow = ai.defineFlow(
  {
    name: 'createSaleFlow',
    inputSchema: CreateSaleInputSchema,
    outputSchema: FlowOutputSchema,
  },
  async ({ vendorId, saleData }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
      const vendorRef = firestore.collection('vendors').doc(vendorId);
      const salesCollectionRef = vendorRef.collection('sales');
      
      const vendorDoc = await vendorRef.get();
      if (!vendorDoc.exists) {
        throw new Error('El comercio no fue encontrado.');
      }
      const vendorData = vendorDoc.data() as Vendor;
      
      const today = startOfDay(new Date());
      const expiry = vendorData.subscriptionEndDate?.toDate 
        ? vendorData.subscriptionEndDate.toDate() 
        : (vendorData.subscriptionEndDate ? new Date(vendorData.subscriptionEndDate) : null);
      
      if (vendorData.status !== 'Activo' || (expiry && expiry < today)) {
          throw new Error('Tu suscripción no está activa. No puedes registrar nuevas ventas hasta regularizar tu pago.');
      }

      const isRental = ['Alquiler Residencial', 'Alquiler Comercial', 'Arrendamiento'].includes(saleData.creditType);
      
      const amount = saleData.amount;
      const downPaymentValue = saleData.downPaymentValue || 0;
      
      let downPaymentAmount = 0;
      let securityDepositAmount = 0;

      if (isRental) {
          securityDepositAmount = saleData.downPaymentType === 'Porcentaje'
              ? amount * (downPaymentValue / 100)
              : downPaymentValue;
          downPaymentAmount = 0;
      } else {
          downPaymentAmount = saleData.downPaymentType === 'Porcentaje'
              ? amount * (downPaymentValue / 100)
              : downPaymentValue;
      }

      const remainingBalance = amount - downPaymentAmount;
      const installmentAmount = saleData.numberOfInstallments > 0
          ? remainingBalance / saleData.numberOfInstallments
          : 0;
          
      const startDate = new Date(`${saleData.firstPaymentDate}T00:00:00`);
      let finalDueDate: Date;

      if (!isValid(startDate) || saleData.numberOfInstallments <= 0) {
          throw new Error('Fecha de primer pago o número de cuotas inválido.');
      }

      const installments = saleData.numberOfInstallments - 1;
      switch (saleData.paymentFrequency) {
          case 'Semanal': finalDueDate = addWeeks(startDate, installments); break;
          case 'Quincenal': finalDueDate = addWeeks(startDate, installments * 2); break;
          case 'Mensual': finalDueDate = addMonths(startDate, installments); break;
          case 'Trimestral': finalDueDate = addQuarters(startDate, installments); break;
          default: throw new Error(`Frecuencia de pago desconocida: ${saleData.paymentFrequency}`);
      }

      const fullIdentification = `${saleData.idPrefix}-${saleData.idNumber}`;
      const fullPhoneNumber = saleData.phonePrefix && saleData.phoneNumber ? `+58${saleData.phonePrefix}${saleData.phoneNumber}` : '';

      const dataToSave: any = {
        ...saleData,
        customerIdentification: fullIdentification,
        customerPhone: fullPhoneNumber,
        securityDepositAmount: parseFloat(securityDepositAmount.toFixed(2)),
        downPaymentAmount: parseFloat(downPaymentAmount.toFixed(2)),
        remainingBalance: parseFloat(remainingBalance.toFixed(2)),
        installmentAmount: parseFloat(installmentAmount.toFixed(2)),
        createdBy: vendorId,
        vendorName: vendorData.name,
        status: 'Pendiente de Confirmación', 
        saleDate: Timestamp.fromDate(new Date(`${saleData.saleDate}T00:00:00`)),
        dueDate: Timestamp.fromDate(finalDueDate),
        firstPaymentDate: Timestamp.fromDate(startDate),
      };

      // Cleanup temporary form fields
      delete dataToSave.idPrefix;
      delete dataToSave.idNumber;
      delete dataToSave.phonePrefix;
      delete dataToSave.phoneNumber;

      const newSaleRef = await salesCollectionRef.add(dataToSave);
      
      const customerIndexRef = firestore.collection('customer_index').doc(fullIdentification);
      await customerIndexRef.set({ vendorIds: FieldValue.arrayUnion(vendorId) }, { merge: true });

      let customerUid: string | null = null;
      const customerQuery = await firestore.collection('customers').where('identificationNumber', '==', fullIdentification).limit(1).get();
      if (customerQuery.empty) {
        await firestore.collection('customers').add({
          name: saleData.customerName,
          email: saleData.customerEmail,
          identificationNumber: fullIdentification,
          phone: fullPhoneNumber,
          role: 'customer'
        });
      } else {
        customerUid = customerQuery.docs[0].id;
      }

      if (saleData.customerEmail) {
        await sendReminderEmail({
            to: saleData.customerEmail,
            customerName: saleData.customerName,
            vendorName: vendorData.name,
            vendorEmail: vendorData.email || 'noreply@histopago.com',
            emailType: 'newSaleConfirmation',
            invoiceNumber: saleData.invoiceNumber,
            totalAmount: saleData.amount,
        });
      }

      if (customerUid) {
        await sendPushNotification({
          userId: customerUid,
          collectionName: 'customers',
          title: `Nuevo Compromiso: ${vendorData.name}`,
          body: `Tienes un nuevo crédito por $${saleData.amount.toFixed(2)}. Revisa los detalles y confirma.`,
          link: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002'}/customer/commitments`
        });
      }

      return {
        success: true,
        message: 'Venta creada exitosamente.',
        id: newSaleRef.id,
      };
    } catch (error: any) {
      console.error('Flow Error: createSaleFlow failed.', error);
      return { success: false, message: error.message || 'Error del servidor al crear la venta.' };
    }
  }
);


// ****** UPDATE SALE FLOW ******

const UpdateSaleInputSchema = z.object({
  vendorId: z.string(),
  saleId: z.string(),
  saleData: CreateSaleSchema,
});

export async function updateSale(
  input: z.infer<typeof UpdateSaleInputSchema>
): Promise<z.infer<typeof FlowOutputSchema>> {
  return updateSaleFlow(input);
}

const updateSaleFlow = ai.defineFlow(
  {
    name: 'updateSaleFlow',
    inputSchema: UpdateSaleInputSchema,
    outputSchema: FlowOutputSchema,
  },
  async ({ vendorId, saleId, saleData }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
      const vendorRef = firestore.collection('vendors').doc(vendorId);
      const vendorSnap = await vendorRef.get();
      if (!vendorSnap.exists) throw new Error('Comercio no encontrado.');
      const vendorData = vendorSnap.data() as Vendor;

      const today = startOfDay(new Date());
      const expiry = vendorData.subscriptionEndDate?.toDate 
        ? vendorData.subscriptionEndDate.toDate() 
        : (vendorData.subscriptionEndDate ? new Date(vendorData.subscriptionEndDate) : null);
      
      if (vendorData.status !== 'Active' && vendorData.status !== 'Activo') {
          // Si el estado no es Activo, validamos contra la fecha por si acaso.
          if (expiry && expiry < today) {
            throw new Error('Tu suscripción no está activa.');
          }
      }

      const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
      const docSnap = await saleRef.get();
      if (!docSnap.exists) {
        throw new Error("La venta no existe.");
      }
      
      const currentSale = docSnap.data() as CreditSale;
      const isRental = ['Alquiler Residencial', 'Alquiler Comercial', 'Arrendamiento'].includes(saleData.creditType);
      const amount = saleData.amount;
      const downPaymentValue = saleData.downPaymentValue || 0;
      
      let downPaymentAmount = 0;
      let securityDepositAmount = 0;
      
      if (isRental) {
        securityDepositAmount = saleData.downPaymentType === 'Porcentaje' ? amount * (downPaymentValue / 100) : downPaymentValue;
        downPaymentAmount = 0;
      } else {
        downPaymentAmount = saleData.downPaymentType === 'Porcentaje' ? amount * (downPaymentValue / 100) : downPaymentValue;
      }
      
      const remainingBalance = amount - downPaymentAmount;
      const installmentAmount = saleData.numberOfInstallments > 0 ? remainingBalance / saleData.numberOfInstallments : 0;

      const startDate = new Date(`${saleData.firstPaymentDate}T00:00:00`);
      let finalDueDate: Date;

      if (!isValid(startDate) || saleData.numberOfInstallments <= 0) {
          throw new Error('Datos de cuotas inválidos.');
      }

      const installments = saleData.numberOfInstallments - 1;
      switch (saleData.paymentFrequency) {
          case 'Semanal': finalDueDate = addWeeks(startDate, installments); break;
          case 'Quincenal': finalDueDate = addWeeks(startDate, installments * 2); break;
          case 'Mensual': finalDueDate = addMonths(startDate, installments); break;
          case 'Trimestral': finalDueDate = addQuarters(startDate, installments); break;
          default: throw new Error(`Frecuencia desconocida.`);
      }

      const fullIdentification = `${saleData.idPrefix}-${saleData.idNumber}`;
      const fullPhoneNumber = saleData.phonePrefix && saleData.phoneNumber ? `+58${saleData.phonePrefix}${saleData.phoneNumber}` : '';

      // Determine new status based on current payments and new dates
      let newStatus = currentSale.status || 'Pendiente';
      
      if (newStatus === 'Pendiente' || newStatus === 'Vencido') {
          const paymentsSnap = await saleRef.collection('payments').where('status', '==', 'Verificado').get();
          const totalPaid = paymentsSnap.docs.reduce((sum, p) => sum + (p.data().amount || 0), 0) + (downPaymentAmount || 0);
          
          if (totalPaid >= amount - 0.01) {
              newStatus = 'Pagado';
          } else {
              newStatus = startOfDay(finalDueDate) < today ? 'Vencido' : 'Pendiente';
          }
      }

      const dataToUpdate: any = {
        ...saleData,
        customerIdentification: fullIdentification,
        customerPhone: fullPhoneNumber,
        securityDepositAmount: parseFloat(securityDepositAmount.toFixed(2)),
        downPaymentAmount: parseFloat(downPaymentAmount.toFixed(2)),
        remainingBalance: parseFloat(remainingBalance.toFixed(2)),
        installmentAmount: parseFloat(installmentAmount.toFixed(2)),
        status: newStatus,
        saleDate: Timestamp.fromDate(new Date(`${saleData.saleDate}T00:00:00`)),
        dueDate: Timestamp.fromDate(finalDueDate),
        firstPaymentDate: Timestamp.fromDate(startDate),
        updatedAt: Timestamp.now(),
      };

      // Cleanup temporary form fields
      delete dataToUpdate.idPrefix;
      delete dataToUpdate.idNumber;
      delete dataToUpdate.phonePrefix;
      delete dataToUpdate.phoneNumber;

      await saleRef.update(dataToUpdate);

      // If ID changed, update customer index
      if (fullIdentification !== currentSale.customerIdentification) {
          const oldIndexRef = firestore.collection('customer_index').doc(currentSale.customerIdentification);
          await oldIndexRef.update({ vendorIds: FieldValue.arrayRemove(vendorId) });
          
          const newIndexRef = firestore.collection('customer_index').doc(fullIdentification);
          await newIndexRef.set({ vendorIds: FieldValue.arrayUnion(vendorId) }, { merge: true });
      }

      return { success: true, message: 'Venta actualizada correctamente.', id: saleId, saleStatus: newStatus };
    } catch (error: any) {
      console.error('Flow Error: updateSaleFlow failed.', error);
      return { success: false, message: error.message || 'Error del servidor.' };
    }
  }
);


// ****** UNIFIED PAYMENT FLOW ******

const PaymentFlowInputSchema = z.object({
  actorId: z.string(),
  actorRole: z.enum(['vendor', 'customer']),
  vendorId: z.string(),
  saleId: z.string(),
  paymentData: CreatePaymentSchema,
});

export async function reportOrConfirmPayment(
  input: z.infer<typeof PaymentFlowInputSchema>
): Promise<z.infer<typeof FlowOutputSchema>> {
  return paymentFlow(input);
}

const paymentFlow = ai.defineFlow(
  {
    name: 'paymentFlow',
    inputSchema: PaymentFlowInputSchema,
    outputSchema: FlowOutputSchema,
  },
  async ({ actorId, actorRole, vendorId, saleId, paymentData }) => {
    const { firestore } = await initializeFirebaseAdmin();
    let newSaleStatus = '';
    let newRemainingBalance = 0;
    
    try {
      const { paymentId, isFullyPaid } = await firestore.runTransaction(async (transaction) => {
        const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
        const saleDoc = await transaction.get(saleRef);
        if (!saleDoc.exists) throw new Error('La venta no existe.');

        const sale = saleDoc.data()! as CreditSale;
        const paymentsCollectionRef = saleRef.collection('payments');
        
        const saleDateRaw = sale.saleDate;
        const saleDate = startOfDay(saleDateRaw.toDate ? saleDateRaw.toDate() : new Date(saleDateRaw));
        const payDate = startOfDay(new Date(`${paymentData.paymentDate}T00:00:00`));

        if (payDate < saleDate) {
            throw new Error(`La fecha del pago (${format(payDate, 'dd/MM/yyyy')}) no puede ser anterior a la fecha de la venta (${format(saleDate, 'dd/MM/yyyy')}).`);
        }

        if (actorRole === 'customer') {
            const customerDoc = await firestore.collection('customers').doc(actorId).get();
            if (!customerDoc.exists || sale.customerIdentification !== customerDoc.data()?.identificationNumber) {
                throw new Error('No tienes permiso para reportar pagos en esta cuenta.');
            }
        }
        
        const verifiedPaymentsSnap = await transaction.get(paymentsCollectionRef.where('status', '==', 'Verificado'));
        const verifiedPayments = verifiedPaymentsSnap.docs.map(doc => doc.data() as Payment);
        const downPaymentAmount = (sale.downPaymentAmount || 0);
        const totalPaidPreviously = verifiedPayments.reduce((sum, p) => sum + p.amount, 0) + downPaymentAmount;
        
        if (paymentData.amount > (sale.amount - totalPaidPreviously) + 0.01) {
            throw new Error(`El monto del pago excede el saldo pendiente.`);
        }

        newRemainingBalance = sale.amount - (totalPaidPreviously + paymentData.amount);
        const isNowFullyPaid = newRemainingBalance <= 0.01;

        let paymentAmountToDistribute = paymentData.amount;
        const appliedToInstallments: Record<number, number> = {};
        const paymentsByInstallment: Record<number, number> = {};
        verifiedPayments.forEach(p => {
          if (!p.appliedToInstallments) return;
          for (const instNumStr in p.appliedToInstallments) {
              const installment = parseInt(instNumStr, 10);
              paymentsByInstallment[installment] = (paymentsByInstallment[installment] || 0) + p.appliedToInstallments[instNumStr];
          }
        });
        
        for (let i = 1; i <= sale.numberOfInstallments; i++) {
            if (paymentAmountToDistribute <= 0) break;
            const paidForThisInstallment = paymentsByInstallment[i] || 0;
            const pendingOnInstallment = sale.installmentAmount - paidForThisInstallment;
            if (pendingOnInstallment > 0) {
                const amountToApply = Math.min(paymentAmountToDistribute, pendingOnInstallment);
                appliedToInstallments[i] = amountToApply;
                paymentAmountToDistribute -= amountToApply;
            }
        }

        const finalPaymentData = {
          ...paymentData,
          creditSaleId: saleId,
          paymentDate: Timestamp.fromDate(new Date(`${paymentData.paymentDate}T00:00:00`)),
          status: actorRole === 'vendor' ? 'Verificado' : 'Pendiente de Verificación',
          reportedBy: actorRole,
          appliedToInstallments: appliedToInstallments,
        };
        
        const newPaymentDocRef = paymentsCollectionRef.doc();
        transaction.set(newPaymentDocRef, finalPaymentData);

        if (actorRole === 'vendor') {
            let isOverdue = false;
            let finalDueDate: Date | null = null;
            if (sale.dueDate) {
                try {
                    finalDueDate = sale.dueDate.toDate ? sale.dueDate.toDate() : new Date(sale.dueDate);
                } catch (e) { finalDueDate = null; }
            }
            if (finalDueDate) isOverdue = startOfDay(finalDueDate) < startOfDay(new Date());
            newSaleStatus = isNowFullyPaid ? 'Pagado' : (isOverdue ? 'Vencido' : 'Pendiente');
            if (newSaleStatus !== sale.status) transaction.update(saleRef, { status: newSaleStatus });
        }
        
        return { paymentId: newPaymentDocRef.id, isFullyPaid: isNowFullyPaid };
      });
      
      if (actorRole === 'vendor') {
        const vendorDoc = await firestore.collection('vendors').doc(vendorId).get();
        const saleDoc = await firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId).get();
        if (vendorDoc.exists && saleDoc.exists) {
            const vendor = vendorDoc.data() as Vendor;
            const sale = saleDoc.data() as CreditSale;
            if (sale.customerEmail) {
                await sendReminderEmail({
                    to: sale.customerEmail,
                    customerName: sale.customerName,
                    vendorName: vendor.name,
                    vendorEmail: vendor.email || '',
                    emailType: isFullyPaid ? 'completion' : 'paymentNotification',
                    paymentAmount: paymentData.amount,
                    paymentDate: paymentData.paymentDate,
                    invoiceNumber: sale.invoiceNumber,
                    dueAmount: newRemainingBalance,
                });
            }
        }
      }

      return { success: true, message: actorRole === 'vendor' ? 'Pago registrado exitosamente.' : 'Pago reportado exitosamente.', id: paymentId };
    } catch (error: any) {
      console.error('Flow Error: paymentFlow failed.', error);
      return { success: false, message: error.message };
    }
  }
);


// ****** VENDOR VERIFY PAYMENT FLOW ******

export async function verifyPaymentByVendor(
    input: { vendorId: string; saleId: string; paymentId: string }
): Promise<z.infer<typeof FlowOutputSchema>> {
    return verifyPaymentByVendorFlow(input);
}

const verifyPaymentByVendorFlow = ai.defineFlow({
    name: 'verifyPaymentByVendorFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        saleId: z.string(),
        paymentId: z.string(),
    }),
    outputSchema: FlowOutputSchema,
}, async ({ vendorId, saleId, paymentId }) => {
    const { firestore } = await initializeFirebaseAdmin();
    let saleData: CreditSale | null = null;
    let paymentBeingVerified: Payment | null = null;
    
    try {
        const { newSaleStatus, newRemainingBalance, isFullyPaid } = await firestore.runTransaction(async (transaction) => {
            const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
            const paymentRef = saleRef.collection('payments').doc(paymentId);
            const saleDoc = await transaction.get(saleRef);
            const paymentDoc = await transaction.get(paymentRef);
            if (!saleDoc.exists || !paymentDoc.exists) throw new Error('Registro no encontrado.');
            const currentSaleData = saleDoc.data() as CreditSale;
            const currentPaymentData = paymentDoc.data() as Payment;
            saleData = currentSaleData;
            paymentBeingVerified = currentPaymentData;
            if (currentPaymentData.status !== 'Pendiente de Verificación') throw new Error('Este pago ya ha sido procesado.');
            const allVerifiedPaymentsSnap = await transaction.get(saleRef.collection('payments').where('status', '==', 'Verificado'));
            const previouslyVerifiedAmount = allVerifiedPaymentsSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const downPaymentAmount = currentSaleData.downPaymentAmount || 0;
            const newTotalPaid = previouslyVerifiedAmount + downPaymentAmount + currentPaymentData.amount;
            const finalRemainingBalance = currentSaleData.amount - newTotalPaid;
            const isNowFullyPaid = finalRemainingBalance <= 0.01;
            let finalSaleStatus = currentSaleData.status;
            if (isNowFullyPaid) {
                finalSaleStatus = 'Pagado';
            } else {
                let isOverdue = false;
                let finalDueDate: Date | null = null;
                if (currentSaleData.dueDate) {
                    try { finalDueDate = currentSaleData.dueDate.toDate ? currentSaleData.dueDate.toDate() : new Date(currentSaleData.dueDate); } catch (e) { finalDueDate = null; }
                }
                if (finalDueDate) isOverdue = startOfDay(finalDueDate) < startOfDay(new Date());
                finalSaleStatus = isOverdue ? 'Vencido' : 'Pendiente';
            }
            transaction.update(paymentRef, { status: 'Verificado' });
            if (finalSaleStatus !== currentSaleData.status) transaction.update(saleRef, { status: finalSaleStatus });
            return { newSaleStatus: finalSaleStatus, newRemainingBalance: finalRemainingBalance, isFullyPaid: isNowFullyPaid };
        });

        if (saleData && paymentBeingVerified) {
            const vendorDoc = await firestore.collection('vendors').doc(vendorId).get();
            const vendor = vendorDoc.data() as Vendor;
            if (vendor && saleData.customerEmail) {
                await sendReminderEmail({
                    to: saleData.customerEmail,
                    customerName: saleData.customerName,
                    vendorName: vendor.name,
                    vendorEmail: vendor.email || '',
                    emailType: isFullyPaid ? 'completion' : 'paymentNotification',
                    paymentAmount: paymentBeingVerified.amount,
                    paymentDate: (paymentBeingVerified.paymentDate as Timestamp).toDate().toISOString(),
                    invoiceNumber: saleData.invoiceNumber,
                    dueAmount: newRemainingBalance,
                });
            }
        }
        return { success: true, message: 'Pago verificado exitosamente.', saleStatus: newSaleStatus, remainingBalance: newRemainingBalance, id: paymentId };
    } catch (error: any) {
        console.error('Flow Error:', error);
        return { success: false, message: error.message };
    }
});


// ****** VENDOR REJECT PAYMENT FLOW ******

export async function rejectPaymentByVendor(
    input: { vendorId: string, saleId: string, paymentId: string, reason: string }
): Promise<z.infer<typeof FlowOutputSchema>> {
  return rejectPaymentByVendorFlow(input);
}

const rejectPaymentByVendorFlow = ai.defineFlow({
    name: 'rejectPaymentByVendorFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        saleId: z.string(),
        paymentId: z.string(),
        reason: z.string(),
    }),
    outputSchema: FlowOutputSchema,
}, async ({ vendorId, saleId, paymentId, reason }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
        const paymentRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId).collection('payments').doc(paymentId);
        await paymentRef.update({ status: 'Rechazado', rejectionReason: reason });
        return { success: true, message: 'Pago rechazado correctamente.' };
    } catch (error: any) {
        console.error('Flow Error:', error);
        return { success: false, message: error.message };
    }
});


// ****** VENDOR VOID PAYMENT FLOW ******

export async function voidPaymentByVendor(
    input: { vendorId: string; saleId: string; paymentId: string; reason: string }
): Promise<z.infer<typeof FlowOutputSchema>> {
    return voidPaymentFlow(input);
}

const voidPaymentFlow = ai.defineFlow({
    name: 'voidPaymentFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        saleId: z.string(),
        paymentId: z.string(),
        reason: z.string().min(1, 'El motivo es obligatorio.'),
    }),
    outputSchema: FlowOutputSchema,
}, async ({ vendorId, saleId, paymentId, reason }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
        const { newSaleStatus, newRemainingBalance } = await firestore.runTransaction(async (transaction) => {
            const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
            const paymentRef = saleRef.collection('payments').doc(paymentId);
            const verifiedPaymentsQuery = saleRef.collection('payments').where('status', '==', 'Verificado');
            
            // EXECUTE ALL READS FIRST
            const [saleDoc, paymentDoc, verifiedPaymentsSnap] = await Promise.all([
                transaction.get(saleRef),
                transaction.get(paymentRef),
                transaction.get(verifiedPaymentsQuery)
            ]);

            if (!saleDoc.exists || !paymentDoc.exists) throw new Error('Registro no encontrado.');
            
            const sale = saleDoc.data() as CreditSale;
            const payment = paymentDoc.data() as Payment;

            if (payment.status === 'Anulado') throw new Error('El pago ya está anulado.');

            // NOW EXECUTE WRITES
            
            // 1. Mark payment as void
            transaction.update(paymentRef, { 
                status: 'Anulado', 
                voidReason: reason,
                voidedAt: Timestamp.now()
            });

            // 2. Recalculate remaining verified payments
            const otherVerifiedAmount = verifiedPaymentsSnap.docs
                .filter(doc => doc.id !== paymentId)
                .reduce((sum, doc) => sum + doc.data().amount, 0);
            
            const downPaymentAmount = sale.downPaymentAmount || 0;
            const finalTotalPaid = otherVerifiedAmount + downPaymentAmount;
            const finalRemainingBalance = sale.amount - finalTotalPaid;

            // 3. Determine new sale status
            let finalSaleStatus = 'Pendiente';
            if (finalRemainingBalance <= 0.01) {
                finalSaleStatus = 'Pagado';
            } else if (sale.dueDate) {
                const dueDate = sale.dueDate.toDate ? sale.dueDate.toDate() : new Date(sale.dueDate);
                if (startOfDay(dueDate) < startOfDay(new Date())) {
                    finalSaleStatus = 'Vencido';
                }
            }

            if (finalSaleStatus !== sale.status) {
                transaction.update(saleRef, { status: finalSaleStatus });
            }

            return { newSaleStatus: finalSaleStatus, newRemainingBalance: finalRemainingBalance };
        });

        return { 
            success: true, 
            message: 'Pago anulado correctamente.', 
            saleStatus: newSaleStatus, 
            remainingBalance: newRemainingBalance 
        };
    } catch (error: any) {
        console.error('Flow Error voiding payment:', error);
        return { success: false, message: error.message };
    }
});


// ****** VENDOR REQUEST MODIFICATION FLOWS ******

export async function requestSaleSuspension(
    input: { vendorId: string; saleId: string; reason: string }
): Promise<z.infer<typeof FlowOutputSchema>> {
    return requestSaleSuspensionFlow(input);
}

const requestSaleSuspensionFlow = ai.defineFlow({
    name: 'requestSaleSuspensionFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        saleId: z.string(),
        reason: z.string().min(1, 'El motivo es obligatorio.'),
    }),
    outputSchema: FlowOutputSchema,
}, async ({ vendorId, saleId, reason }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
        const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
        await saleRef.update({
            status: 'Solicitud de Suspension',
            suspensionReason: reason,
            suspensionRequestDate: Timestamp.now(),
        });
        return { success: true, message: 'Solicitud de suspensión enviada al administrador.' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
});

export async function requestSaleDeletion(
    input: { vendorId: string; saleId: string; reason: string }
): Promise<z.infer<typeof FlowOutputSchema>> {
    return requestSaleDeletionFlow(input);
}

const requestSaleDeletionFlow = ai.defineFlow({
    name: 'requestSaleDeletionFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        saleId: z.string(),
        reason: z.string().min(1, 'El motivo es obligatorio.'),
    }),
    outputSchema: FlowOutputSchema,
}, async ({ vendorId, saleId, reason }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
        const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
        await saleRef.update({
            status: 'Solicitud de Eliminacion',
            suspensionReason: reason,
            suspensionRequestDate: Timestamp.now(),
        });
        return { success: true, message: 'Solicitud de eliminación enviada al administrador.' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
});


// ****** ADMIN RESOLVE MODIFICATION FLOW ******

export async function getSuspensionRequests(): Promise<CreditSale[]> {
    return getSuspensionRequestsFlow();
}

const getSuspensionRequestsFlow = ai.defineFlow({
    name: 'getSuspensionRequestsFlow',
    outputSchema: z.array(CreditSaleSchema),
}, async () => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
        const vendorsSnapshot = await firestore.collection('vendors').get();
        const allRequests: CreditSale[] = [];

        const vendorPromises = vendorsSnapshot.docs.map(async (vDoc) => {
            const salesSnapshot = await vDoc.ref.collection('sales')
                .where('status', 'in', ['Solicitud de Suspension', 'Solicitud de Eliminacion'])
                .get();
            
            return salesSnapshot.docs.map(sDoc => {
                const data = sDoc.data();
                return {
                    ...data,
                    id: sDoc.id,
                    createdBy: vDoc.id,
                    vendorName: data.vendorName || vDoc.data()?.name || 'Comercio Desconocido',
                } as CreditSale;
            });
        });

        const results = await Promise.all(vendorPromises);
        results.forEach(list => allRequests.push(...list));

        return allRequests.sort((a,b) => {
            const dateA = a.suspensionRequestDate?.toDate ? a.suspensionRequestDate.toDate() : new Date(0);
            const dateB = b.suspensionRequestDate?.toDate ? b.suspensionRequestDate.toDate() : new Date(0);
            return dateB.getTime() - dateA.getTime();
        });
    } catch (error) {
        console.error("Error fetching requests:", error);
        return [];
    }
});

export async function resolveSuspensionRequest(
  input: { vendorId: string; saleId: string; action: 'approve' | 'reject' }
): Promise<z.infer<typeof FlowOutputSchema>> {
  return resolveSuspensionRequestFlow(input);
}

const resolveSuspensionRequestFlow = ai.defineFlow(
  {
    name: 'resolveSuspensionRequestFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        saleId: z.string(),
        action: z.enum(['approve', 'reject']),
    }),
    outputSchema: FlowOutputSchema,
  },
  async ({ vendorId, saleId, action }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
      const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
      const saleDoc = await saleRef.get();
      if (!saleDoc.exists) throw new Error('La venta ya no existe.');
      
      const saleData = saleDoc.data() as CreditSale;
      const isDeletionRequest = saleData.status === 'Solicitud de Eliminacion';
      
      if (action === 'approve') {
        if (isDeletionRequest) {
            // PERMANENT DELETE (including subcollections)
            const subcollections = ['payments', 'default_reports'];
            for (const sub of subcollections) {
                const snapshot = await saleRef.collection(sub).get();
                const deletePromises = snapshot.docs.map(doc => doc.ref.delete());
                await Promise.all(deletePromises);
            }
            await saleRef.delete();
            return { success: true, message: 'El crédito ha sido eliminado permanentemente del sistema.' };
        } else {
            // ADMINISTRATIVE CLOSE (Suspension)
            await saleRef.update({ 
                status: 'Cerrado Administrativamente',
                updatedAt: Timestamp.now()
            });
            return { success: true, message: 'El crédito ha sido cerrado administrativamente.' };
        }
      } else {
        // REJECT: Return to previous status based on due date
        const dueDate = saleData.dueDate.toDate ? saleData.dueDate.toDate() : new Date(saleData.dueDate);
        const newStatus = startOfDay(dueDate) < startOfDay(new Date()) ? 'Vencido' : 'Pendiente';
        
        await saleRef.update({
          status: newStatus,
          suspensionReason: FieldValue.delete(),
          suspensionRequestDate: FieldValue.delete(),
          updatedAt: Timestamp.now()
        });
        return { success: true, message: 'La solicitud ha sido rechazada y el crédito reactivado.' };
      }
    } catch (error: any) {
      console.error('Flow Error in resolveSuspensionRequestFlow:', error);
      return { success: false, message: error.message || 'Error al procesar la solicitud.' };
    }
  }
);


// ****** CUSTOMER CONFIRM SALE FLOW ******

export async function confirmSaleByCustomer(
  input: { vendorId: string; saleId: string; customerId: string }
): Promise<z.infer<typeof FlowOutputSchema>> {
  return confirmSaleByCustomerFlow(input);
}

const confirmSaleByCustomerFlow = ai.defineFlow(
  {
    name: 'confirmSaleByCustomerFlow',
    inputSchema: z.object({
        vendorId: z.string(),
        saleId: z.string(),
        customerId: z.string(),
    }),
    outputSchema: FlowOutputSchema,
  },
  async ({ vendorId, saleId, customerId }) => {
    const { firestore } = await initializeFirebaseAdmin();
    try {
        const saleRef = firestore.collection('vendors').doc(vendorId).collection('sales').doc(saleId);
        const saleDoc = await saleRef.get();
        if (!saleDoc.exists) throw new Error('Venta no encontrada.');

        const saleData = saleDoc.data() as CreditSale;
        if (saleData.status !== 'Pendiente de Confirmación') {
            throw new Error('Esta venta ya ha sido confirmada o procesada.');
        }

        const customerDoc = await firestore.collection('customers').doc(customerId).get();
        if (!customerDoc.exists || customerDoc.data()?.identificationNumber !== saleData.customerIdentification) {
            throw new Error('No tienes permiso para confirmar esta venta.');
        }

        // Determine if it should be Pending or Overdue based on current date
        const dueDate = saleData.dueDate.toDate ? saleData.dueDate.toDate() : new Date(saleData.dueDate);
        const newStatus = startOfDay(dueDate) < startOfDay(new Date()) ? 'Vencido' : 'Pendiente';

        await saleRef.update({ 
            status: newStatus,
            confirmedAt: Timestamp.now()
        });

        return { success: true, message: 'Venta confirmada exitosamente.', saleStatus: newStatus };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
  }
);
