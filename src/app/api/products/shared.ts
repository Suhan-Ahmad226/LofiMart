import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { validateAccessToken, type SessionUser } from '@/src/services/auth/sessionStore';

export const PRODUCT_STATUSES = {
  draft: 'draft',
  published: 'published',
} as const;

export const SELLER_STATUSES = {
  approved: 'approved',
} as const;

type JsonArray = unknown[] | null | undefined;

export function toPlainNumber(value: unknown) {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
    store_name: product.seller?.storeName ?? null,
    seller_rating:
      Array.isArray(product.seller?.products) && product.seller.products.length > 0
        ? Number(
            (
              product.seller.products.reduce((sum: number, entry: any) => sum + Number(entry.rating ?? 0), 0) /
              product.seller.products.length
            ).toFixed(1),
          )
        : null,
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
    role: 'seller',
    sellerStatus: SELLER_STATUSES.approved,
    storefrontPublished: true,
    profileVisibility: { not: 'private' as const },
  };
}

export function getPublicPublishedProductWhere(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    productStatus: PRODUCT_STATUSES.published,
    seller: getPublicApprovedSellerWhere(),
  };
}

export const productSellerInclude = {
  seller: {
    select: {
      id: true,
      name: true,
      storeName: true,
      sellerStatus: true,
      storefrontPublished: true,
      responseTimeHours: true,
      products: {
        select: {
          rating: true,
        },
      },
      verificationSubmission: {
        select: {
          status: true,
        },
      },
    },
  },
};

export async function requireApiUser(request: NextRequest): Promise<SessionUser | NextResponse> {
  const header = request.headers.get('authorization') || '';
  const headerToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  const token = headerToken || request.cookies.get('access_token')?.value || '';

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return await validateAccessToken(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export function normalizeJsonArray(value: unknown): JsonArray {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${base || 'product'}-${Date.now()}`;
}

export async function userCanManageProduct(user: SessionUser, productId: string) {
  if (user.role === 'admin') return true;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { sellerId: true },
  });

  return Boolean(product && product.sellerId === String(user.id));
}
