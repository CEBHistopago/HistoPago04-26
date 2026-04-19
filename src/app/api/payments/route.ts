import { NextResponse } from 'next/server';
import { CreatePaymentSchema } from '@/lib/data';
import { reportOrConfirmPayment } from '@/ai/flows/vendor-sales-flow';
import { findVendorByApiKey } from '../utils';
import { z } from 'zod';
import { initializeFirebaseAdmin } from '@/firebase/server';

const ApiPaymentSchema = z.object({
  invoiceNumber: z.string().min(1, 'invoiceNumber is required.'),
  customerIdentification: z.string().min(1, 'customerIdentification is required.'),
  payment: CreatePaymentSchema,
});

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    console.log('[API /payments] New request', { requestId });

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, code: 'AUTH_MISSING', message: 'Authorization header is missing or invalid.' },
        { status: 401 },
      );
    }
    const apiKey = authHeader.split(' ')[1];

    const vendor = await findVendorByApiKey(apiKey);
    if (!vendor) {
      return NextResponse.json(
        { success: false, code: 'API_KEY_INVALID', message: 'Invalid API Key.' },
        { status: 403 },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (e) {
      return NextResponse.json(
        { success: false, code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
        { status: 400 },
      );
    }

    const validation = ApiPaymentSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_BODY',
          message: 'Invalid request body.',
          errors: validation.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { invoiceNumber, customerIdentification, payment: paymentData } = validation.data;

    const { firestore } = await initializeFirebaseAdmin();

    // 👇 SIN query/where/limit importados: se usan métodos encadenados
    const salesRef = firestore.collection('vendors').doc(vendor.id).collection('sales');

    const salesSnapshot = await salesRef
      .where('invoiceNumber', '==', invoiceNumber)
      .where('customerIdentification', '==', customerIdentification)
      .limit(1)
      .get();

    console.log('[API /payments] Sales query result', {
      requestId,
      found: !salesSnapshot.empty,
      count: salesSnapshot.size,
    });

    if (salesSnapshot.empty) {
      return NextResponse.json(
        {
          success: false,
          code: 'SALE_NOT_FOUND',
          message: `Sale with invoiceNumber '${invoiceNumber}' for customer '${customerIdentification}' not found.`,
        },
        { status: 404 },
      );
    }

    const saleId = salesSnapshot.docs[0].id;

    const result = await reportOrConfirmPayment({
      actorId: vendor.id,
      actorRole: 'vendor',
      vendorId: vendor.id,
      saleId,
      paymentData,
    });

    console.log('[API /payments] Flow result', { requestId, result });

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json(
      { ...result, success: false, code: result.code ?? 'BUSINESS_ERROR' },
      { status: 400 },
    );
  } catch (error: any) {
    console.error('[API /payments] Unexpected Error', {
      requestId,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });

    let errorMessage = 'An unexpected server error occurred.';
    if (error instanceof Error && error.message) errorMessage = error.message;
    else if (typeof error === 'string') errorMessage = error;
    else if (error && typeof error === 'object' && 'message' in error) errorMessage = String((error as any).message);

    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      },
      { status: 500 },
    );
  }
}
