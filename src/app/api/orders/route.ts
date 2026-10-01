import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../products/shared';
import { serializeOrder } from '../_compat/shared';
import { createMarketplaceOrder } from '../../../features/telegram_bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const orders = await prisma.order.findMany({
    where: { userId: String(user.id) },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, image: true, slug: true } },
        },
      },
      shipments: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ orders: orders.map(serializeOrder), items: orders });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const suppliedIdempotencyKey = String(request.headers.get('x-idempotency-key') || body.idempotencyKey || '').trim();
  const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID();
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) return NextResponse.json({ error: 'A valid idempotency key is required.' }, { status: 400 });
  const existingOrder = await prisma.order.findUnique({ where: { idempotencyKey }, include: { items: { include: { product: true } }, shipments: { include: { items: true } }, invoice: true } });
  if (existingOrder) {
    if (existingOrder.userId && existingOrder.userId !== String(user.id)) return NextResponse.json({ error: 'Invalid idempotency key.' }, { status: 409 });
    return NextResponse.json({ success: true, id: existingOrder.id, orderId: existingOrder.orderCode || existingOrder.id, order_code: existingOrder.orderCode, order: serializeOrder(existingOrder), replayed: true }, { status: 200 });
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item: { id?: string | number; productId?: string | number; quantity?: number; qty?: number }) => ({
      productId: String(item.id || item.productId || ''),
      quantity: Math.max(1, Number(item.quantity || item.qty || 1)),
    }))
    .filter(
      (item: { productId: string; quantity: number }) =>
        item.productId && Number.isFinite(item.quantity),
    );

  if (items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  try {
    const order = await createMarketplaceOrder({
      userId: String(user.id),
      tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : 'cod',
      refCode: body.refCode ? String(body.refCode) : undefined,
      shippingAddress: body.shippingAddress || body.fullAddressSummary || null,
      couponCode: body.couponCode ? String(body.couponCode) : undefined,
      items,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        success: true,
        id: order?.id,
        orderId: order?.orderCode || order?.id,
        order_code: order?.orderCode,
        order: serializeOrder(order),
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error && /insufficient|stock|courier|shipping|coupon|delivery/i.test(error.message) ? error.message : 'Unable to create the order. Please try again.',
      },
      { status: 400 },
    );
  }
}
