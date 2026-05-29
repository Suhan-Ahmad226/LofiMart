import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const row = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { points: true, walletBalance: true },
  });

  return NextResponse.json(row ? { points: row.points, wallet_balance: toPlainNumber(row.walletBalance) } : { points: 0, wallet_balance: 0 });
}
