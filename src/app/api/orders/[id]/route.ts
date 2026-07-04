import { NextRequest, NextResponse } from 'next/server';
import {
  canReadOrder,
  getAuthorizedUser,
  getInvoiceOrderById,
  isAuthResponse,
  serializeOrderDetail,
  type OrderRouteParams,
} from './_invoice';

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

    return NextResponse.json(serializeOrderDetail(order));
  } catch (error) {
    console.error('GET /api/orders/[id] error:', error);
    return NextResponse.json({ error: 'Failed to load order' }, { status: 500 });
  }
}
