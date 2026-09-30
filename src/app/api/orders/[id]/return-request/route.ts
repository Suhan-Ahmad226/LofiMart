import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeAccountActionRequest(request: any) {
  return {
    id: request.id,
    order_id: request.orderId ?? null,
    type: request.type,
    status: request.status,
    reason: request.reason ?? null,
    resolution_note: request.resolutionNote ?? null,
    processed_at: request.processedAt ? new Date(request.processedAt).toISOString() : null,
    created_at: request.createdAt ? new Date(request.createdAt).toISOString() : undefined,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: {
      id,
      userId: String(user.id),
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  if (!['delivered', 'returned'].includes(String(order.status))) {
    return NextResponse.json(
      { error: 'Return requests are available only after delivery.' },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) {
    return NextResponse.json(
      { error: 'Please provide a clear return reason with at least 10 characters.' },
      { status: 400 },
    );
  }

  const existing = await prisma.accountActionRequest.findFirst({
    where: {
      userId: String(user.id),
      orderId: order.id,
      type: 'return_request',
      status: { in: ['pending', 'approved'] },
    } as any,
  });

  if (existing) {
    return NextResponse.json(
      { error: 'A return request for this order is already active.' },
      { status: 409 },
    );
  }

  const actionRequest = await prisma.accountActionRequest.create({
    data: {
      userId: String(user.id),
      orderId: order.id,
      type: 'return_request',
      status: 'pending',
      reason,
    } as any,
  });

  return NextResponse.json({ success: true, request: serializeAccountActionRequest(actionRequest) });
}
