import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../_compat/shared';
import { deleteMedia, enqueueMediaDelete, parseCloudinaryAssetUrl } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const row = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: {
      storeName: true,
      storefrontSlug: true,
      storefrontBannerUrl: true,
      storefrontHeadline: true,
      storefrontAccentColor: true,
      storefrontCustomDomain: true,
      storefrontPublished: true,
      storefrontDomainStatus: true,
      storefrontDomainVerificationToken: true,
      storefrontDomainVerifiedAt: true,
      profileVisibility: true,
      responseTimeHours: true,
      bio: true,
    },
  });

  return NextResponse.json({
    store_name: row?.storeName ?? null,
    storefront_slug: row?.storefrontSlug ?? null,
    storefront_banner_url: row?.storefrontBannerUrl ?? null,
    storefront_headline: row?.storefrontHeadline ?? null,
    storefront_accent_color: row?.storefrontAccentColor ?? null,
    storefront_custom_domain: row?.storefrontCustomDomain ?? null,
    storefront_published: Boolean(row?.storefrontPublished ?? true),
    storefront_domain_status: row?.storefrontDomainStatus ?? 'unverified',
    storefront_domain_verification_token: row?.storefrontDomainVerificationToken ?? null,
    storefront_domain_verified_at: row?.storefrontDomainVerifiedAt ? new Date(row.storefrontDomainVerifiedAt).toISOString() : null,
    profile_visibility: row?.profileVisibility ?? 'private',
    response_time_hours: row?.responseTimeHours ?? null,
    bio: row?.bio ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({}));
  const data: Record<string, any> = {};

  if (typeof body?.storeName === 'string') data.storeName = body.storeName.trim() || null;
  if (typeof body?.storefrontSlug === 'string') data.storefrontSlug = body.storefrontSlug.trim() || null;
  if (typeof body?.storefrontBannerUrl === 'string') data.storefrontBannerUrl = body.storefrontBannerUrl.trim() || null;
  if (typeof body?.storefrontHeadline === 'string') data.storefrontHeadline = body.storefrontHeadline.trim() || null;
  if (typeof body?.storefrontAccentColor === 'string') data.storefrontAccentColor = body.storefrontAccentColor.trim() || null;
  if (typeof body?.storefrontCustomDomain === 'string') data.storefrontCustomDomain = body.storefrontCustomDomain.trim() || null;
  if (typeof body?.storefrontPublished === 'boolean') data.storefrontPublished = body.storefrontPublished;
  if (typeof body?.profileVisibility === 'string') data.profileVisibility = body.profileVisibility;
  if (body?.responseTimeHours === null || typeof body?.responseTimeHours === 'number') {
    data.responseTimeHours = Number.isFinite(Number(body.responseTimeHours)) ? Number(body.responseTimeHours) : null;
  }
  if (typeof body?.bio === 'string') data.bio = body.bio.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { storefrontBannerUrl: true },
    });

    const updated = await prisma.user.update({
      where: { id: String(user.id) },
      data,
      select: {
        storeName: true,
        storefrontSlug: true,
        storefrontBannerUrl: true,
        storefrontHeadline: true,
        storefrontAccentColor: true,
        storefrontCustomDomain: true,
        storefrontPublished: true,
        storefrontDomainStatus: true,
        profileVisibility: true,
        responseTimeHours: true,
        bio: true,
      },
    });

    if (
      typeof data.storefrontBannerUrl === 'string' &&
      current?.storefrontBannerUrl &&
      current.storefrontBannerUrl !== updated.storefrontBannerUrl
    ) {
      try {
        await deleteMedia({ url: current.storefrontBannerUrl });
      } catch {
        await enqueueMediaDelete({
          url: current.storefrontBannerUrl,
          reason: 'seller-storefront-banner-replaced',
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

    return NextResponse.json({
      store_name: updated.storeName ?? null,
      storefront_slug: updated.storefrontSlug ?? null,
      storefront_banner_url: updated.storefrontBannerUrl ?? null,
      storefront_headline: updated.storefrontHeadline ?? null,
      storefront_accent_color: updated.storefrontAccentColor ?? null,
      storefront_custom_domain: updated.storefrontCustomDomain ?? null,
      storefront_published: Boolean(updated.storefrontPublished ?? true),
      storefront_domain_status: updated.storefrontDomainStatus ?? 'unverified',
      profile_visibility: updated.profileVisibility ?? 'private',
      response_time_hours: updated.responseTimeHours ?? null,
      bio: updated.bio ?? null,
    });
  } catch (error: any) {
    console.error('PATCH /api/seller/storefront-settings error:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'A storefront slug or domain is already in use.' }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message || 'Failed to update storefront settings' }, { status: 500 });
  }
}
