import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, serializeWalletTransaction, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const userId = String(user.id);
  const [row, transactions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        points: true,
        walletBalance: true,
      },
    }),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    points: row?.points ?? 0,
    wallet_balance: toPlainNumber(row?.walletBalance ?? 0),
    transactions: transactions.map(serializeWalletTransaction),
  });
}
