import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireAdminRole, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(base: string) {
  let slug = base || 'flash-sale';
  let candidate = slug;
  let suffix = 1;
  while (await prisma.flashSaleCampaign.findFirst({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${slug}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function serializeEntry(entry: any) {
  return {
    id: entry.id,
    seller_name: entry.seller?.name ?? null,
    sale_price: toPlainNumber(entry.salePrice) ?? 0,
    allocated_stock: entry.allocatedStock ?? 0,
    status: entry.status,
    note: entry.note ?? null,
    rejection_reason: entry.rejectionReason ?? null,
    product: entry.product
      ? {
          id: entry.product.id,
          name: entry.product.name,
          price: toPlainNumber(entry.product.price) ?? 0,
          seller_name: (entry.product.seller && entry.product.seller.name) ?? null,
        }
      : null,
  };
}

function serializeCampaign(campaign: any) {
  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description ?? '',
    banner_image: campaign.bannerImage ?? '',
    starts_at: campaign.startsAt ? new Date(campaign.startsAt).toISOString() : undefined,
    ends_at: campaign.endsAt ? new Date(campaign.endsAt).toISOString() : undefined,
    status: campaign.status,
    entries: Array.isArray(campaign.entries) ? campaign.entries.map(serializeEntry) : [],
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  try {
    const campaigns = await prisma.flashSaleCampaign.findMany({
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        entries: {
          orderBy: { createdAt: 'desc' },
          include: {
            seller: { select: { name: true } },
            product: { include: { seller: { select: { name: true } } } },
          },
        },
      },
    });

    return NextResponse.json(campaigns.map(serializeCampaign));
  } catch (error) {
    console.error('GET /api/admin/flash-sale error:', error);
    return NextResponse.json({ error: 'Failed to load flash sale campaigns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const bannerImage = typeof body.bannerImage === 'string' ? body.bannerImage.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : 'draft';
  const startsAtRaw = typeof body.startsAt === 'string' ? body.startsAt : '';
  const endsAtRaw = typeof body.endsAt === 'string' ? body.endsAt : '';

  if (!title) return NextResponse.json({ error: 'Campaign title is required' }, { status: 400 });
  if (!startsAtRaw || !endsAtRaw) {
    return NextResponse.json({ error: 'Start and end time are required' }, { status: 400 });
  }

  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: 'Invalid campaign schedule' }, { status: 400 });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
  }

  try {
    const slug = await uniqueSlug(slugify(title));
    const campaign = await prisma.flashSaleCampaign.create({
      data: {
        title,
        slug,
        description: description || null,
        bannerImage: bannerImage || null,
        startsAt,
        endsAt,
        status: ['draft', 'scheduled', 'published', 'live', 'ended'].includes(status) ? status : 'draft',
        createdById: String(user.id),
      },
      include: {
        entries: {
          include: {
            seller: { select: { name: true } },
            product: { include: { seller: { select: { name: true } } } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, campaign: serializeCampaign(campaign) });
  } catch (error) {
    console.error('POST /api/admin/flash-sale error:', error);
    return NextResponse.json({ error: 'Failed to create flash sale campaign' }, { status: 500 });
  }
}