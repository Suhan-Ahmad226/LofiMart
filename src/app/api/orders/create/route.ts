import { NextRequest, NextResponse } from 'next/server';
import { createMarketplaceOrder } from '../../../../features/telegram_bot';
import { requireApiUser, serializeOrder } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body.items)
      ? body.items
          .map((item: { productId?: string | number; id?: string | number; quantity?: number; qty?: number }) => ({
            productId: String(item.productId || item.id || ''),
            quantity: Math.max(1, Number(item.quantity || item.qty || 1)),
          }))
          .filter((item: { productId: string; quantity: number }) => item.productId && Number.isFinite(item.quantity))
      : [];

    const order = await createMarketplaceOrder({
      userId: String(user.id),
      items,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : 'cod',
      shippingAddress: body.shippingAddress || body.fullAddressSummary || undefined,
      refCode: body.refCode ? String(body.refCode) : undefined,
      couponCode: body.couponCode ? String(body.couponCode) : undefined,
      idempotencyKey: String(body.idempotencyKey || request.headers.get('x-idempotency-key') || crypto.randomUUID()),
    });

    return NextResponse.json(
      {
        success: true,
        order: serializeOrder(order),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create order',
      },
      { status: 400 },
    );
  }
}
