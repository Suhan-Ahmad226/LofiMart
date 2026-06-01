import { NextRequest, NextResponse } from 'next/server';
import {
  buildInvoicePdf,
  canReadOrder,
  ensureInvoiceRecord,
  getAuthorizedUser,
  getInvoiceOrderById,
  invoiceFilename,
  isAuthResponse,
  serializeOrderDetail,
  type OrderRouteParams,
} from '../_invoice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: OrderRouteParams) {
  try {
    const user = await getAuthorizedUser(request);
    if (isAuthResponse(user)) return user;

    const { id } = await params;
    const order = await getInvoiceOrderById(id);

    if (!order || !canReadOrder(user, order)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    await ensureInvoiceRecord(order);
    const payload = serializeOrderDetail(order);
    const pdf = buildInvoicePdf(payload);

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceFilename(payload, 'pdf')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('GET /api/orders/[id]/invoice.pdf error:', error);
    return NextResponse.json({ error: 'Failed to generate invoice PDF' }, { status: 500 });
  }
}
