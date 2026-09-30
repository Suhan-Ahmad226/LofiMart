import crypto from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { storefrontSettingsSchema } from '@/modules/profile/validation';
import { createNotification } from '@/features/shared/services/notifications/notificationService';
import { deleteMedia, enqueueMediaDelete, parseCloudinaryAssetUrl } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ensureReferralCode(resellerId: string) {
  const existing = await prisma.resellerReferral.findUnique({
    where: { resellerId },
  });
  if (existing) return existing;
  return prisma.resellerReferral.create({
    data: {
      resellerId,
      code: `REF-${resellerId.slice(-6)}-${Date.now().toString(36).toUpperCase()}`,
      clicks: 0,
    },
  });
}

function buildStorefrontDomainVerificationPayload(domain?: string | null, token?: string | null, status?: string | null, verifiedAt?: Date | string | null) {
  const normalizedDomain = domain ? String(domain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '') : null;
  const normalizedToken = token ? String(token) : null;
  return {
    domain: normalizedDomain,
    token: normalizedToken,
    status: status || 'unverified',
    verified_at: verifiedAt ? new Date(verifiedAt).toISOString() : null,
    txt_host: normalizedDomain ? `_amarshop-challenge.${normalizedDomain}` : null,
    cname_target: normalizedDomain ? 'stores.lofimart.com' : null,
  };
}

function normalizeStorefrontSlug(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'storefront'}-${Date.now()}`;
}

function normalizeStorefrontDomain(value?: string | null) {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function generateStorefrontDomainVerificationToken() {
  return `asb-${crypto.randomBytes(12).toString('hex')}`;
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['reseller'])(user);
  if (roleError) return roleError;

  try {
    const reseller = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: {
        id: true,
        name: true,
        bio: true,
        storeName: true,
        storefrontBannerUrl: true,
        storefrontHeadline: true,
        storefrontAccentColor: true,
        storefrontCustomDomain: true,
        storefrontPublished: true,
        storefrontDomainStatus: true,
        storefrontDomainVerificationToken: true,
        storefrontDomainVerifiedAt: true,
      },
    });

    if (!reseller) {
      return NextResponse.json({ error: 'Reseller not found' }, { status: 404 });
    }

    const { code } = await ensureReferralCode(String(user.id));

    return NextResponse.json({
      store_name: reseller.storeName || reseller.name || '',
      bio: reseller.bio || '',
      storefront_code: code,
      storefront_banner_url: reseller.storefrontBannerUrl || '',
      storefront_headline: reseller.storefrontHeadline || '',
      storefront_accent_color: reseller.storefrontAccentColor || '#0F766E',
      storefront_custom_domain: reseller.storefrontCustomDomain || '',
      storefront_published: Boolean(reseller.storefrontPublished ?? true),
      domain_verification: buildStorefrontDomainVerificationPayload(
        reseller.storefrontCustomDomain,
        reseller.storefrontDomainVerificationToken,
        reseller.storefrontDomainStatus,
        reseller.storefrontDomainVerifiedAt,
      ),
    });
  } catch (error) {
    console.error('GET /api/reseller/storefront-settings error:', error);
    return NextResponse.json({ error: 'Failed to load reseller storefront settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['reseller'])(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({})) || {};
  const parsed = storefrontSettingsSchema.safeParse({
    storefront_slug: normalizeStorefrontSlug(`r-${String(user.id).slice(-6)}`),
    storefront_headline: body?.storefront_headline,
    storefront_banner_url: body?.storefront_banner_url,
    storefront_accent_color: typeof body?.storefront_accent_color === 'string' ? body.storefront_accent_color.trim() : '',
    storefront_custom_domain: normalizeStorefrontDomain(body?.storefront_custom_domain) || '',
    storefront_published: Boolean(body?.storefront_published),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid reseller storefront payload' }, { status: 400 });
  }

  const userId = String(user.id);
  const payload = parsed.data;

  try {
    if (payload.storefront_custom_domain) {
      const conflictingDomain = await prisma.user.findFirst({
        where: {
          storefrontCustomDomain: payload.storefront_custom_domain,
          id: { not: userId },
        },
        select: { id: true },
      });

      if (conflictingDomain) {
        return NextResponse.json({ error: 'This custom domain is already connected to another storefront.' }, { status: 409 });
      }
    }

    const nextDomain = payload.storefront_custom_domain || null;
    const currentReseller = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        storefrontBannerUrl: true,
        storefrontCustomDomain: true,
        storefrontDomainVerificationToken: true,
      },
    });

    const domainChanged = normalizeStorefrontDomain(currentReseller?.storefrontCustomDomain) !== normalizeStorefrontDomain(nextDomain);
    const nextToken =
      nextDomain && (domainChanged || !currentReseller?.storefrontDomainVerificationToken)
        ? generateStorefrontDomainVerificationToken()
        : currentReseller?.storefrontDomainVerificationToken ?? null;

    const updatedReseller = await prisma.user.update({
      where: { id: userId },
      data: {
        storefrontSlug: payload.storefront_slug,
        storefrontHeadline: payload.storefront_headline || null,
        storefrontBannerUrl: payload.storefront_banner_url || null,
        storefrontAccentColor: payload.storefront_accent_color || '#0F766E',
        storefrontCustomDomain: nextDomain,
        storefrontPublished: payload.storefront_published,
        storefrontDomainStatus: nextDomain ? 'pending' : 'unverified',
        storefrontDomainVerificationToken: nextDomain ? nextToken : null,
        storefrontDomainVerifiedAt: nextDomain ? null : null,
      },
    });

    if (
      currentReseller?.storefrontBannerUrl &&
      currentReseller.storefrontBannerUrl !== updatedReseller.storefrontBannerUrl
    ) {
      try {
        await deleteMedia({ url: currentReseller.storefrontBannerUrl });
      } catch {
        await enqueueMediaDelete({
          url: currentReseller.storefrontBannerUrl,
          reason: 'reseller-storefront-banner-replaced',
          entityType: 'User',
          entityId: userId,
        });
      }
    }

    const parsedBanner = parseCloudinaryAssetUrl(updatedReseller.storefrontBannerUrl);
    if (parsedBanner) {
      await prisma.mediaAsset.upsert({
        where: { publicId_resourceType: { publicId: parsedBanner.publicId, resourceType: parsedBanner.resourceType } },
        create: {
          url: updatedReseller.storefrontBannerUrl!,
          publicId: parsedBanner.publicId,
          resourceType: parsedBanner.resourceType,
          ownerType: 'User',
          ownerId: userId,
          entityType: 'User',
          entityId: userId,
          fieldName: 'storefrontBannerUrl',
        },
        update: {
          url: updatedReseller.storefrontBannerUrl!,
          ownerType: 'User',
          ownerId: userId,
          entityType: 'User',
          entityId: userId,
          fieldName: 'storefrontBannerUrl',
          status: 'active',
          deletedAt: null,
        },
      });
    }

    const { code } = await ensureReferralCode(userId);

    return NextResponse.json({
      success: true,
      storefront: {
        storefront_code: code,
        storefront_banner_url: updatedReseller.storefrontBannerUrl,
        storefront_headline: updatedReseller.storefrontHeadline,
        storefront_accent_color: updatedReseller.storefrontAccentColor,
        storefront_custom_domain: updatedReseller.storefrontCustomDomain,
        storefront_published: updatedReseller.storefrontPublished,
        domain_verification: buildStorefrontDomainVerificationPayload(
          updatedReseller.storefrontCustomDomain,
          updatedReseller.storefrontDomainVerificationToken,
          updatedReseller.storefrontDomainStatus,
          updatedReseller.storefrontDomainVerifiedAt,
        ),
      },
    });
  } catch (error) {
    console.error('PATCH /api/reseller/storefront-settings error:', error);
    return NextResponse.json({ error: 'Failed to update reseller storefront settings' }, { status: 500 });
  }
}
