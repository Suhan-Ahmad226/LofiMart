import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import {
  requireApiUser,
  requireSellerRole,
  serializeFlashSaleCampaign,
  serializeFlashSaleEntry,
} from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const [campaigns, entries] = await Promise.all([
    prisma.flashSaleCampaign.findMany({
      where: { status: { in: ['draft', 'scheduled', 'live', 'published'] } },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.flashSaleEntry.findMany({
      where: { sellerId },
      include: {
        product: true,
        seller: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    campaigns: campaigns.map(serializeFlashSaleCampaign),
    entries: entries.map(serializeFlashSaleEntry),
  });
}
