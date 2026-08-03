import { NextRequest, NextResponse } from 'next/server';
import {
  buildInvoicePdf,
  ensureInvoiceRecord,
  getInvoiceOrderById,
  invoiceFilename,
  serializeOrderDetail,
} from '../../../../../app/api/orders/[id]/_invoice';
import { verifyTelegramInvoiceToken } from '../../../../../features/telegram_bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = {
  params: Promise<{ orderId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { orderId } = await params;
  const token = request.nextUrl.searchParams.get('token');

  if (!verifyTelegramInvoiceToken(orderId, token)) {
    return NextResponse.json({ error: 'Invalid or expired invoice token' }, { status: 401 });
  }

  try {
    const order = await getInvoiceOrderById(orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    await ensureInvoiceRecord(order);
    const payload = serializeOrderDetail(order);
    const pdf = buildInvoicePdf(payload);

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceFilename(payload, 'pdf')}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('GET /api/telegram/invoices/[orderId] error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice PDF' }, { status: 500 });
  }
}
