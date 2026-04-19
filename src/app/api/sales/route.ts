import { NextResponse } from 'next/server';
import { CreateSaleSchema } from '@/lib/data';
import { createSale } from '@/ai/flows/vendor-sales-flow';
import { findVendorByApiKey } from '../utils';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    console.log('[API /sales] New request', { requestId });

    // 1. Authenticate the request
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[API /sales] Missing/invalid auth header', { requestId });
      return NextResponse.json(
        {
          success: false,
          code: 'AUTH_MISSING',
          message: 'Authorization header is missing or invalid.',
        },
        { status: 401 },
      );
    }

    const apiKey = authHeader.split(' ')[1];
    console.log('[API /sales] API key received', { requestId });

    const vendor = await findVendorByApiKey(apiKey);
    if (!vendor) {
      console.warn('[API /sales] Invalid API key', { requestId });
      return NextResponse.json(
        {
          success: false,
          code: 'API_KEY_INVALID',
          message: 'Invalid API Key.',
        },
        { status: 403 },
      );
    }

    // 2. Parse and validate the request body
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch (e) {
      console.warn('[API /sales] Invalid JSON body', {
        requestId,
        error: String(e),
      });
      return NextResponse.json(
        {
          success: false,
          code: 'INVALID_JSON',
          message: 'Request body is not valid JSON.',
        },
        { status: 400 },
      );
    }

    const validation = CreateSaleSchema.safeParse(rawBody);

    if (!validation.success) {
      console.warn('[API /sales] Body validation failed', {
        requestId,
        errors: validation.error.flatten(),
      });
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

    const saleData = validation.data;
    const fullIdentification = `${saleData.idPrefix}-${saleData.idNumber}`;
    const fullPhoneNumber =
      saleData.phonePrefix && saleData.phoneNumber
        ? `+58${saleData.phonePrefix}${saleData.phoneNumber}`
        : '';

    console.log('[API /sales] Validated body', {
      requestId,
      invoiceNumber: saleData.invoiceNumber,
      customerIdentification: fullIdentification,
    });

    // 3. Call the existing flow to create the sale
    console.log('[API /sales] Calling createSale', {
      requestId,
      vendorId: vendor.id,
    });

    const result = await createSale({
      vendorId: vendor.id,
      saleData: {
        ...saleData,
        customerIdentification: fullIdentification,
        customerPhone: fullPhoneNumber,
      },
    });

    console.log('[API /sales] Flow result', { requestId, result });

    // 4. Return the result
    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    }

    return NextResponse.json(
      {
        ...result,
        success: false,
        code: result.code ?? 'BUSINESS_ERROR',
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error('[API /sales] Unexpected Error', {
      requestId,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });

    let errorMessage = 'An unexpected server error occurred.';

    if (error instanceof Error && error.message) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String((error as any).message);
    }

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
