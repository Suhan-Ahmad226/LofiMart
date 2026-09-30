import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireAdminRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { buildPrismaPagination } from '@/server/middleware/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializePayoutTransaction(transaction: any) {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    source: transaction.source,
    description: transaction.description,
    balance_after: transaction.balanceAfter ?? 0,
    metadata: transaction.metadata ?? null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

function serializePayoutMethod(method: any) {
  return {
    id: method.id,
    type: method.type,
    provider: method.provider,
    details: method.details,
    status: method.status,
    is_default: method.isDefault ? 1 : 0,
    created_at: method.createdAt ? new Date(method.createdAt).toISOString() : undefined,
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const { skip, take, meta } = buildPrismaPagination(request as any);
  const [total, transactions] = await Promise.all([
    prisma.payoutTransaction.count(),
    prisma.payoutTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        payoutMethod: true,
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: transactions.map((transaction) => ({
      ...serializePayoutTransaction(transaction),
      user: transaction.user,
      payout_method: transaction.payoutMethod ? serializePayoutMethod(transaction.payoutMethod) : null,
    })),
    meta: { ...meta, total },
  });
}
