import { NextRequest, NextResponse } from 'next/server';
import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/server';
import { requireApiUser, type AuthenticatedUser } from '@/server/auth';

export { requireApiUser };
export type { AuthenticatedUser as SessionUser };

export const PRODUCT_STATUSES = {
  draft: 'draft',
  published: 'published',
} as const;

export const SELLER_STATUSES = {
  approved: 'approved',
} as const;

export function toPlainNumber(value: unknown) {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^-|-$/g, '');
}

export function serializeProduct(product: any) {
  return {
    id: product.id,
    sku: product.sku ?? null,
    name: product.name,
    slug: product.slug,
    description: product.description ?? '',
    price: toPlainNumber(product.price),
    old_price: toPlainNumber(product.oldPrice ?? product.price),
    image: product.image ?? null,
    gallery_images: Array.isArray(product.galleryImages)
      ? product.galleryImages.filter((item: unknown) => typeof item === 'string' && item.trim())
      : [],
    video_url: product.videoUrl ?? null,
    model_3d: product.model3d ?? null,
    category: product.category ?? null,
    stock: product.stock,
    rating: product.rating ?? 0,
    reviews_count: product.reviewsCount ?? 0,
    variant_options: Array.isArray(product.variantOptions) ? product.variantOptions : [],
    specifications: Array.isArray(product.specifications) ? product.specifications : [],
    reseller_enabled: Boolean(product.resellerEnabled),
    reseller_base_price: product.resellerBasePrice == null ? null : toPlainNumber(product.resellerBasePrice),
    reseller_suggested_price:
      product.resellerSuggestedPrice == null ? null : toPlainNumber(product.resellerSuggestedPrice),
    reseller_notes: product.resellerNotes ?? null,
    product_status: product.productStatus ?? PRODUCT_STATUSES.draft,
    is_published: (product.productStatus ?? PRODUCT_STATUSES.draft) === PRODUCT_STATUSES.published,
    seller_id: product.sellerId ?? null,
    seller_name: product.seller?.name ?? undefined,
    seller_avatar_url: product.seller?.avatarUrl ?? null,
    store_name: product.seller?.storeName ?? null,
    storefront_slug: product.seller?.storefrontSlug ?? null,
    seller_rating: null,
    response_time_hours: product.seller?.responseTimeHours ?? null,
    verification_badge: product.seller?.verificationSubmission?.status === 'verified',
    created_at: product.createdAt ? new Date(product.createdAt).toISOString() : undefined,
    published_at: product.publishedAt ? new Date(product.publishedAt).toISOString() : null,
  };
}

export function serializeReview(review: any) {
  return {
    id: review.id,
    product_id: review.productId,
    user_id: review.userId,
    rating: review.rating,
    comment: review.comment ?? '',
    created_at: review.createdAt ? new Date(review.createdAt).toISOString() : undefined,
    user_name: review.user?.name ?? 'Anonymous',
  };
}

export function getPublicApprovedSellerWhere() {
  return {
    role: 'seller' as UserRole,
    sellerStatus: SELLER_STATUSES.approved,
    storefrontPublished: true,
    profileVisibility: { not: 'private' as const },
  };
}

export function getPublicPublishedProductWhere(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    productStatus: PRODUCT_STATUSES.published,
    OR: [
      {
        seller: {
          role: 'admin' as UserRole,
        },
      },
      {
        seller: getPublicApprovedSellerWhere(),
      },
    ],
  };
}

export const productSellerInclude = {
  seller: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      storeName: true,
      storefrontSlug: true,
      sellerStatus: true,
      storefrontPublished: true,
      responseTimeHours: true,
      verificationSubmission: {
        select: {
          status: true,
        },
      },
    },
  },
};

export async function userCanManageProduct(user: AuthenticatedUser, productId: string) {
  if (user.role === 'admin') return true;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { sellerId: true },
  });

  return Boolean(product && product.sellerId === String(user.id));
}
