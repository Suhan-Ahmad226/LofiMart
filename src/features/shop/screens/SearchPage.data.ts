import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere } from '@/app/api/products/shared';
import type { Product } from '@/types';

export type SearchPageData = {
  initialProducts: Product[];
  trendingSearches: string[];
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    const converted = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(converted) ? converted : 0;
  }
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function getSearchPageData(query?: string): Promise<SearchPageData> {
  const [trendingResult, productsResult] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: 'asc' },
      take: 12,
      select: { id: true, name: true, icon: true },
    }),
    query && query.trim().length > 0
      ? prisma.product.findMany({
          where: getPublicPublishedProductWhere({
            OR: [
              { name: { contains: query.trim(), mode: 'insensitive' as const } },
              { description: { contains: query.trim(), mode: 'insensitive' as const } },
              { category: { contains: query.trim(), mode: 'insensitive' as const } },
            ],
          }),
          select: {
            id: true,
            name: true,
            price: true,
            oldPrice: true,
            image: true,
            category: true,
            slug: true,
            rating: true,
            reviewsCount: true,
            sellerId: true,
            seller: { select: { name: true } },
          },
          orderBy: [{ rating: 'desc' }, { reviewsCount: 'desc' }, { createdAt: 'desc' }],
          take: 48,
        })
      : Promise.resolve([]),
  ]);

  const trendingSearches = Array.from(
    new Set([
      ...trendingResult.map((c) => c.name),
      ...productsResult.slice(0, 8).map((p) => p.category).filter((value): value is string => Boolean(value)),
      ...productsResult.slice(0, 8).map((p) => p.name),
    ]),
  ).slice(0, 8);

  return {
    initialProducts: productsResult.map((product): Product => ({
      id: product.id,
      sku: null,
      name: product.name,
      slug: product.slug,
      description: '',
      price: toNumber(product.price),
      old_price: toNumber(product.oldPrice ?? product.price),
      image: product.image ?? null,
      gallery_images: [],
      video_url: null,
      model_3d: null,
      category: product.category ?? null,
      stock: 0,
      rating: toNumber(product.rating),
      reviews_count: product.reviewsCount ?? 0,
      variant_options: [],
      specifications: [],
      reseller_enabled: false,
      reseller_base_price: null,
      reseller_suggested_price: null,
      reseller_notes: null,
      product_status: 'published',
      is_published: true,
      published_at: null,
      reseller_ref_code: null,
      reseller_sale_price: null,
      selected_variant_key: null,
      selected_variant_summary: null,
      selected_variant_sku: null,
      seller_id: product.sellerId ?? null,
      seller_name: product.seller?.name ?? null,
      store_name: null,
      storefront_slug: null,
      seller_rating: null,
      response_time_hours: null,
      verification_badge: false,
    })),
    trendingSearches,
  };
}
