import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, toPlainNumber } from '@/app/api/_compat/shared';

function serializePayoutTransaction(transaction: any) {
  return {
    id: transaction.id,
    user_id: transaction.userId,
    payout_method_id: transaction.payoutMethodId ?? null,
    type: transaction.type,
    amount: toPlainNumber(transaction.amount),
    currency: transaction.currency,
    status: transaction.status,
    reference: transaction.reference ?? null,
    notes: transaction.notes ?? null,
    metadata: transaction.metadata ?? null,
    processed_at: transaction.processedAt ? new Date(transaction.processedAt).toISOString() : null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

function serializeResellerPayout(payout: any) {
  return {
    id: payout.id,
    reseller_id: payout.resellerId,
    amount: toPlainNumber(payout.amount),
    status: payout.status,
    notes: payout.notes ?? null,
    paid_at: payout.paidAt ? new Date(payout.paidAt).toISOString() : null,
    created_at: payout.createdAt ? new Date(payout.createdAt).toISOString() : undefined,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const [transactions, resellerPayouts] = await Promise.all([
    prisma.payoutTransaction.findMany({
      where: { userId: String(user.id) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    user.role === 'reseller'
      ? prisma.resellerPayout.findMany({
          where: { resellerId: String(user.id) },
          orderBy: { createdAt: 'desc' },
          take: 25,
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    transactions: transactions.map(serializePayoutTransaction),
    reseller_payouts: resellerPayouts.map(serializeResellerPayout),
  });
}
