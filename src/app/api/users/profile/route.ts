import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getProfilePayload, requireApiUser, serializeUser } from '../../_compat/shared';
import { deleteMedia, enqueueMediaDelete, parseCloudinaryAssetUrl } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const minimal = request.nextUrl.searchParams.get('minimal') === '1';
  if (minimal) {
    const profile = await prisma.user.findUnique({ where: { id: String(user.id) } });
    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: serializeUser(profile) });
  }

  const payload = await getProfilePayload(String(user.id));
  if (!payload) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ('name' in body) data.name = body.name ? String(body.name) : null;
  if ('phone' in body) data.phone = body.phone ? String(body.phone) : null;
  if ('alternate_phone' in body) data.alternatePhone = body.alternate_phone ? String(body.alternate_phone) : null;
  if ('bio' in body) data.bio = body.bio ? String(body.bio) : null;
  if ('store_name' in body) data.storeName = body.store_name ? String(body.store_name) : null;
  if ('storefront_headline' in body) data.storefrontHeadline = body.storefront_headline ? String(body.storefront_headline) : null;
  if ('storefront_banner_url' in body) data.storefrontBannerUrl = body.storefront_banner_url ? String(body.storefront_banner_url) : null;
  if ('storefront_accent_color' in body) data.storefrontAccentColor = body.storefront_accent_color ? String(body.storefront_accent_color) : null;
  if ('profile_visibility' in body) data.profileVisibility = body.profile_visibility ? String(body.profile_visibility) : 'private';
  if ('response_time_hours' in body) {
    data.responseTimeHours = body.response_time_hours == null ? null : Number(body.response_time_hours);
  }

  const current = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { storefrontBannerUrl: true },
  });

  const updated = await prisma.user.update({
    where: { id: String(user.id) },
    data,
  });

  if (
    'storefrontBannerUrl' in data &&
    current?.storefrontBannerUrl &&
    current.storefrontBannerUrl !== updated.storefrontBannerUrl
  ) {
    try {
      await deleteMedia({ url: current.storefrontBannerUrl });
    } catch {
      await enqueueMediaDelete({
        url: current.storefrontBannerUrl,
        reason: 'profile-storefront-banner-replaced',
        entityType: 'User',
        entityId: String(user.id),
      });
    }
  }

  const parsedBanner = parseCloudinaryAssetUrl(updated.storefrontBannerUrl);
  if (parsedBanner) {
    await prisma.mediaAsset.upsert({
      where: { publicId_resourceType: { publicId: parsedBanner.publicId, resourceType: parsedBanner.resourceType } },
      create: {
        url: updated.storefrontBannerUrl!,
        publicId: parsedBanner.publicId,
        resourceType: parsedBanner.resourceType,
        ownerType: 'User',
        ownerId: String(user.id),
        entityType: 'User',
        entityId: String(user.id),
        fieldName: 'storefrontBannerUrl',
      },
      update: {
        url: updated.storefrontBannerUrl!,
        ownerType: 'User',
        ownerId: String(user.id),
        entityType: 'User',
        entityId: String(user.id),
        fieldName: 'storefrontBannerUrl',
        status: 'active',
        deletedAt: null,
      },
    });
  }

  const payload = await getProfilePayload(String(user.id));
  return NextResponse.json(payload);
}
