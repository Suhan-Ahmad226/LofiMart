import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireAdminRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const [revenueAgg, pendingOrders, orderItems, paymentStatusGroups, pendingReturnRequests, recentRefundRows] = await Promise.all([
    prisma.order.aggregate({
      where: { status: { not: 'cancelled' } },
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: { status: { in: ['processing', 'packed'] } },
      select: { id: true },
    }),
    prisma.orderItem.findMany({
      include: {
        order: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        product: {
          select: {
            sellerId: true,
            seller: {
              select: { name: true },
            },
          },
        },
      },
    }),
    prisma.order.groupBy({
      by: ['paymentStatus'],
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.accountActionRequest.count({
      where: {
        type: 'return_request',
        status: 'pending',
      },
    }),
    prisma.refund.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        transaction: {
          include: {
            order: {
              select: {
                id: true,
                userId: true,
                total: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const pendingOrderIds = new Set(pendingOrders.map((order) => order.id));
  const payoutMap = new Map<string, { id: string; seller_name: string; amount: number; date: string; status: string }>();
  let pendingPayouts = 0;

  for (const item of orderItems) {
    const sellerId = item.product?.sellerId;
    const sellerName = item.product?.seller?.name;
    const order = item.order;
    if (!sellerId || !sellerName || !order) continue;

    const amount = Number(item.price) * item.qty;
    const key = `${order.id}:${sellerId}`;
    const existing = payoutMap.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      payoutMap.set(key, {
        id: `${order.id}-${sellerId}`,
        seller_name: sellerName,
        amount,
        date: order.createdAt.toISOString(),
        status: order.status,
      });
    }

    if (pendingOrderIds.has(order.id)) {
      pendingPayouts += amount;
    }
  }

  const recentPayouts = [...payoutMap.values()]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  const refundUserIds = [
    ...new Set(
      recentRefundRows
        .map((refund) => refund.transaction?.order?.userId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const refundUsers = refundUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: refundUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const refundUserMap = new Map(refundUsers.map((u) => [u.id, u]));

  const paymentSummary = paymentStatusGroups.reduce(
    (acc, entry) => {
      const key = String(entry.paymentStatus || 'untracked').toLowerCase();
      const count = Number(entry._count?._all || 0);
      const amount = toPlainNumber(entry._sum?.total ?? 0);

      if (key === 'paid') {
        acc.paidOrders += count;
        acc.paidAmount += amount;
      } else if (key === 'refunded') {
        acc.refundedOrders += count;
        acc.refundedAmount += amount;
      } else if (['failed', 'payment_failed'].includes(key)) {
        acc.failedOrders += count;
        acc.failedAmount += amount;
      } else if (['requires_payment', 'pending'].includes(key)) {
        acc.awaitingPaymentOrders += count;
        acc.awaitingPaymentAmount += amount;
      } else {
        acc.untrackedOrders += count;
      }

      return acc;
    },
    {
      paidOrders: 0,
      paidAmount: 0,
      refundedOrders: 0,
      refundedAmount: 0,
      failedOrders: 0,
      failedAmount: 0,
      awaitingPaymentOrders: 0,
      awaitingPaymentAmount: 0,
      untrackedOrders: 0,
    },
  );

  return NextResponse.json({
    totalRevenue: toPlainNumber(revenueAgg._sum.total ?? 0),
    pendingPayouts,
    recentPayouts,
    recentRefunds: recentRefundRows.map((refund) => {
      const customerId = refund.transaction?.order?.userId ?? null;
      const customer = customerId ? refundUserMap.get(customerId) : null;
      return {
        id: refund.id,
        provider_refund_id: refund.providerRefundId,
        amount: toPlainNumber(refund.amount),
        status: refund.status,
        reason: refund.reason ?? null,
        created_at: refund.createdAt ? new Date(refund.createdAt).toISOString() : null,
        payment_provider: refund.transaction?.provider ?? null,
        order_id: refund.transaction?.order?.id ?? null,
        customer_name: customer?.name ?? null,
        customer_email: customer?.email ?? null,
      };
    }),
    paymentSummary,
    pendingReturnRequests,
  });
}
