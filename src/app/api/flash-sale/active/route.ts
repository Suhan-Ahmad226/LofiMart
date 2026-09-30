import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { productSellerInclude, serializeProduct, toPlainNumber } from '../../products/shared';

export const runtime = 'nodejs';

const publicCampaignStatuses = ['active', 'published', 'scheduled'];
const publicEntryStatuses = ['approved', 'active', 'published'];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;

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
  };
}

function serializeEntry(entry: any) {
  return {
    id: entry.id,
    sale_price: toPlainNumber(entry.salePrice) ?? 0,
    allocated_stock: entry.allocatedStock ?? 0,
    product: entry.product ? serializeProduct(entry.product) : null,
  };
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = clampInteger(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = clampInteger(searchParams.get('offset'), 0, 0, 10000);

    const now = new Date();

    const campaign =
      (await prisma.flashSaleCampaign.findFirst({
        where: {
          status: { in: publicCampaignStatuses },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        orderBy: { endsAt: 'asc' },
      })) ||
      (await prisma.flashSaleCampaign.findFirst({
        where: {
          status: { in: publicCampaignStatuses },
          startsAt: { gt: now },
        },
        orderBy: { startsAt: 'asc' },
      }));

    if (!campaign) {
      return NextResponse.json(
        { campaign: null, entries: [], pagination: { limit, offset: 0, total: 0, hasMore: false } },
        {
          headers: {
            'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=900',
          },
        },
      );
    }

    const [entries, total] = await Promise.all([
      prisma.flashSaleEntry.findMany({
        where: { campaignId: campaign.id, status: { in: publicEntryStatuses } },
        orderBy: { createdAt: 'asc' },
        skip: offset,
        take: limit,
        include: { product: { include: productSellerInclude } },
      }),
      prisma.flashSaleEntry.count({
        where: { campaignId: campaign.id, status: { in: publicEntryStatuses } },
      }),
    ]);

    return NextResponse.json(
      {
        campaign: serializeCampaign(campaign),
        entries: entries.map(serializeEntry),
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + entries.length < total,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=900',
        },
      },
    );
  } catch (error) {
    console.error('GET /api/flash-sale/active error:', error);
    return NextResponse.json(
      { campaign: null, entries: [], pagination: { limit: DEFAULT_LIMIT, offset: 0, total: 0, hasMore: false } },
      {
        headers: {
          'X-Data-Source': 'fallback',
          'Cache-Control': 'public, max-age=120, s-maxage=300, stale-while-revalidate=900',
        },
      },
    );
  }
}
