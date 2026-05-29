import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole, serializeFlashSaleEntry } from '../../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const body = await request.json().catch(() => ({}));
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim() : '';
  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const allocatedStock = Number(body.allocatedStock ?? 0);
  const salePrice = Number(body.salePrice ?? 0);

  if (!campaignId || !productId || !Number.isFinite(salePrice) || salePrice <= 0) {
    return NextResponse.json({ error: 'Campaign, product, and valid sale price are required' }, { status: 400 });
  }

  const [campaign, product] = await Promise.all([
    prisma.flashSaleCampaign.findUnique({ where: { id: campaignId } }),
    prisma.product.findFirst({
      where: {
        id: productId,
        sellerId,
      },
    }),
  ]);

  if (!campaign) return NextResponse.json({ error: 'Flash sale campaign not found' }, { status: 404 });
  if (!product) return NextResponse.json({ error: 'Seller product not found' }, { status: 404 });
  if (['ended', 'archived'].includes(campaign.status)) {
    return NextResponse.json({ error: 'This campaign is no longer accepting product submissions' }, { status: 400 });
  }

  const entry = await prisma.flashSaleEntry.upsert({
    where: {
      campaignId_productId: {
        campaignId,
        productId,
      },
    },
    update: {
      salePrice,
      allocatedStock: Number.isFinite(allocatedStock) ? Math.max(0, Math.floor(allocatedStock)) : 0,
      note: note || null,
      status: 'pending',
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
    },
    create: {
      campaignId,
      sellerId,
      productId,
      salePrice,
      allocatedStock: Number.isFinite(allocatedStock) ? Math.max(0, Math.floor(allocatedStock)) : 0,
      note: note || null,
      status: 'pending',
    },
    include: {
      product: true,
      seller: { select: { name: true } },
      reviewedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ success: true, entry: serializeFlashSaleEntry(entry) });
}
