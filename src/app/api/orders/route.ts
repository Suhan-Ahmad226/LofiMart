import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../products/shared';
import { serializeOrder } from '../_compat/shared';
import { createMarketplaceOrder } from '@/src/features/telegram_bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const orders = await prisma.order.findMany({
    where: { userId: String(user.id), NOT: { status: 'draft' } },
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
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item: { id?: string | number; productId?: string | number; quantity?: number; qty?: number; price?: number }) => ({
      productId: String(item.id || item.productId || ''),
      quantity: Math.max(1, Number(item.quantity || item.qty || 1)),
      price: Number(item.price || 0),
    }))
    .filter(
      (item: { productId: string; quantity: number; price: number }) =>
        item.productId && Number.isFinite(item.price) && item.price >= 0,
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
      items,
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
        error: error instanceof Error ? error.message : 'Failed to create order',
      },
      { status: 400 },
    );
  }
}
