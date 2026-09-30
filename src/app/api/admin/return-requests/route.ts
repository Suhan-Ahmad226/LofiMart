import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeAccountActionRequest(request: any) {
  return {
    id: request.id,
    user_id: request.userId,
    order_id: request.orderId ?? null,
    type: request.type,
    status: request.status,
    reason: request.reason ?? null,
    resolution_note: request.resolutionNote ?? null,
    processed_by_id: request.processedById ?? null,
    processed_at: request.processedAt ? new Date(request.processedAt).toISOString() : null,
    created_at: request.createdAt ? new Date(request.createdAt).toISOString() : undefined,
    updated_at: request.updatedAt ? new Date(request.updatedAt).toISOString() : undefined,
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole([''])(user);
  if (roleError) return roleError;

  const requests = await prisma.accountActionRequest.findMany({
    where: { type: 'return_request' },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });

  const userIds = [...new Set(requests.map((request) => String(request.userId)).filter(Boolean))];
  const orderIds = [...new Set(requests.map((request) => String(request.orderId || '')).filter(Boolean))];
  const processedByIds = [...new Set(requests.map((request) => String(request.processedById || '')).filter(Boolean))];

  const [users, orders, processors] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        total: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        courierProvider: true,
        trackingId: true,
      },
    }),
    prisma.user.findMany({
      where: { id: { in: processedByIds } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const processorMap = new Map(processors.map((u) => [u.id, u]));

  const summary = requests.reduce(
    (acc, request) => {
      const status = String(request.status || 'pending').toLowerCase();
      acc.total += 1;
      if (status === 'pending') acc.pending += 1;
      if (status === 'approved') acc.approved += 1;
      if (status === 'rejected') acc.rejected += 1;
      if (status === 'refunded') acc.refunded += 1;
      return acc;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0, refunded: 0 },
  );

  return NextResponse.json({
    summary,
    requests: requests.map((request) => {
      const customer = userMap.get(String(request.userId));
      const order = request.orderId ? orderMap.get(String(request.orderId)) : null;
      const processedBy = request.processedById ? processorMap.get(String(request.processedById)) : null;

      return {
        ...serializeAccountActionRequest(request),
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              email: customer.email,
            }
          : null,
        order: order
          ? {
              id: order.id,
              total: order.total,
              status: order.status,
              payment_status: order.paymentStatus ?? null,
              courier_provider: order.courierProvider ?? null,
              tracking_id: order.trackingId ?? null,
              created_at: order.createdAt ? new Date(order.createdAt).toISOString() : null,
            }
          : null,
        processed_by: processedBy
          ? {
              id: processedBy.id,
              name: processedBy.name,
              email: processedBy.email,
            }
          : null,
      };
    }),
  });
}
