import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { productSellerInclude, serializeProduct, toPlainNumber } from '../../products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicCampaignStatuses = ['active', 'published', 'scheduled'];
const publicEntryStatuses = ['approved', 'active', 'published'];

function serializeCampaign(campaign: any) {
  return {
    id: campaign.id,
    title: campaign.title,
    slug: campaign.slug,
    description: campaign.description ?? '',
    banner_image: campaign.bannerImage ?? null,
    starts_at: campaign.startsAt ? new Date(campaign.startsAt).toISOString() : null,
    ends_at: campaign.endsAt ? new Date(campaign.endsAt).toISOString() : null,
    status: campaign.status,
    entries: (campaign.entries || []).map((entry: any) => ({
      id: entry.id,
      sale_price: toPlainNumber(entry.salePrice) ?? 0,
      allocated_stock: entry.allocatedStock ?? 0,
      product: entry.product ? serializeProduct(entry.product) : null,
    })),
  };
}

export async function GET() {
  try {
    const now = new Date();
    const campaign =
      (await prisma.flashSaleCampaign.findFirst({
        where: {
          status: { in: publicCampaignStatuses },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        orderBy: { endsAt: 'asc' },
        include: {
          entries: {
            where: { status: { in: publicEntryStatuses } },
            orderBy: { createdAt: 'desc' },
            include: {
              product: {
                include: productSellerInclude,
              },
            },
          },
        },
      })) ||
      (await prisma.flashSaleCampaign.findFirst({
        where: {
          status: { in: publicCampaignStatuses },
          startsAt: { gt: now },
        },
        orderBy: { startsAt: 'asc' },
        include: {
          entries: {
            where: { status: { in: publicEntryStatuses } },
            orderBy: { createdAt: 'desc' },
            include: {
              product: {
                include: productSellerInclude,
              },
            },
          },
        },
      }));

    return NextResponse.json({
      campaign: campaign ? serializeCampaign(campaign) : null,
    });
  } catch (error) {
    console.error('GET /api/flash-sale/active error:', error);
    return NextResponse.json({ campaign: null }, { headers: { 'X-Data-Source': 'fallback' } });
  }
}
