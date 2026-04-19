import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/firebase/server';
import { reportOrConfirmPayment } from '@/ai/flows/vendor-sales-flow';
import { CreatePaymentSchema } from '@/lib/data';
import { z } from 'zod';

// Schema for the request body of this specific endpoint
const ApiCustomerPaymentSchema = z.object({
  vendorId: z.string().min(1, "vendorId is required."),
  saleId: z.string().min(1, "saleId is required."),
  payment: CreatePaymentSchema,
});

export async function POST(request: Request) {
  try {
    // 1. Authenticate the customer request via ID Token
    const { adminApp } = await initializeFirebaseAdmin();
    const auth = getAuth(adminApp);

    const idToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json({ success: false, message: 'Authorization header with Firebase ID Token is missing.' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const customerUid = decodedToken.uid;

    // 2. Parse and validate the request body
    const rawBody = await request.json();
    const validation = ApiCustomerPaymentSchema.safeParse(rawBody);

    if (!validation.success) {
        return NextResponse.json({ success: false, message: 'Invalid request body.', errors: validation.error.flatten() }, { status: 400 });
    }
    
    const { vendorId, saleId, payment: paymentData } = validation.data;

    // 3. Call the existing flow to report the payment
    // The flow itself contains the necessary security check to ensure the customer owns the sale.
    const result = await reportOrConfirmPayment({
        actorId: customerUid,
        actorRole: 'customer',
        vendorId: vendorId,
        saleId: saleId,
        paymentData: paymentData,
    });

    // 4. Return the result
    if (result.success) {
        return NextResponse.json(result, { status: 201 }); // 201 Created
    } else {
        // The flow will return a specific error message, e.g., if permission is denied.
        return NextResponse.json(result, { status: 400 });
    }

  } catch (error: any) {
    console.error('[API /customer/payments] Error:', error);

    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
      return NextResponse.json({ success: false, message: 'Invalid or expired Firebase ID Token.' }, { status: 403 });
    }
    
    let errorMessage = 'An unexpected server error occurred.';
    if (error instanceof Error) {
        errorMessage = error.message;
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String(error.message);
    }
    
    return NextResponse.json({ success: false, message: errorMessage }, { status: 500 });
  }
}
