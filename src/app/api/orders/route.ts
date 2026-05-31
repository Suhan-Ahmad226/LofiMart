import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../products/shared';
import { serializeOrder } from '../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildOrderCode() {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

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
    .map((item: any) => ({
      productId: String(item.id || item.productId || ''),
      qty: Math.max(1, Number(item.quantity || item.qty || 1)),
      price: Number(item.price || 0),
    }))
    .filter((item) => item.productId && Number.isFinite(item.price) && item.price >= 0);

  if (items.length === 0) {
    return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
  }

  const calculatedTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const total = Number.isFinite(Number(body.total)) && Number(body.total) >= 0 ? Number(body.total) : calculatedTotal;
  const orderCode = buildOrderCode();

  const order = await prisma.order.create({
    data: {
      userId: String(user.id),
      tenantId: typeof user.tenantId === 'string' ? user.tenantId : undefined,
      total,
      status: 'processing',
      orderCode,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : 'cod',
      paymentStatus: String(body.paymentMethod || '').includes('bkash') ? 'pending' : 'unpaid',
      refCode: body.refCode ? String(body.refCode) : null,
      shippingAddress: body.shippingAddress || body.fullAddressSummary || null,
      items: {
        create: items.map((item) => ({
          productId: item.productId,
          qty: item.qty,
          price: item.price,
        })),
      },
    },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, image: true, slug: true } },
        },
      },
      shipments: true,
    },
  });

  return NextResponse.json(
    {
      success: true,
      id: order.id,
      orderId: order.orderCode || order.id,
      order_code: order.orderCode,
      order: serializeOrder(order),
    },
    { status: 201 },
  );
}
