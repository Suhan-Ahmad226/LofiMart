import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getPublicPublishedProductWhere, serializeProduct } from '../products/shared';
import { raceWithTimeout } from '../_utils/route-timeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function takeProducts<T>(products: T[], start: number, count: number) {
  return products.slice(start, start + count);
}

function groupHomepageProducts<T>(products: T[]) {
  return {
    flashSale: takeProducts(products, 0, 4),
    featured: takeProducts(products, 4, 8),
    bestSelling: takeProducts(products, 12, 6),
    newArrivals: takeProducts(products, 18, 6),
    trending: takeProducts(products, 24, 6),
  };
}

export async function GET() {
  try {
    const now = new Date();
    const [{ value: products, timedOut: productTimedOut }, { value: categories }, { value: flashSaleCampaign }, { value: banners }] =
      await Promise.all([
        raceWithTimeout(
          prisma.product.findMany({
            where: getPublicPublishedProductWhere(),
            select: {
              id: true,
              sku: true,
              name: true,
              slug: true,
              price: true,
              oldPrice: true,
              image: true,
              category: true,
              stock: true,
              rating: true,
              reviewsCount: true,
              productStatus: true,
              sellerId: true,
              createdAt: true,
              publishedAt: true,
              seller: {
                select: {
                  name: true,
                  avatarUrl: true,
                  storeName: true,
                  storefrontSlug: true,
                  responseTimeHours: true,
                  verificationSubmission: { select: { status: true } },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: 60,
          }),
          4000,
          [],
        ),
        raceWithTimeout(
          prisma.category.findMany({
            select: {
              id: true,
              name: true,
              icon: true,
            },
            orderBy: { name: 'asc' },
          }),
          2500,
          [],
        ),
        raceWithTimeout(
          prisma.flashSaleCampaign.findFirst({
            where: {
              status: { in: ['active', 'published', 'live'] },
              startsAt: { lte: now },
              endsAt: { gt: now },
            },
            orderBy: { endsAt: 'asc' },
            select: { endsAt: true },
          }),
          1000,
          null,
        ),
        raceWithTimeout(
          prisma.banner.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              title: true,
              subtitle: true,
              image: true,
              link: true,
              buttonText: true,
            },
          }),
          2500,
          [],
        ),
      ]);

    if (productTimedOut) {
      console.warn('GET /api/shop-page products timed out; returning partial storefront payload');
    }

    const productPayload = products
      .filter((product) => !product.image || !product.image.startsWith('data:'))
      .map(serializeProduct);
    const categoryPayload =
      categories.length > 0
        ? categories
        : Array.from(new Set(productPayload.map((product) => product.category).filter(Boolean))).map((name) => ({
            id: String(name).toLowerCase().replace(/\s+/g, '-'),
            name,
            icon: null,
          }));

    const groups = groupHomepageProducts(productPayload);

    return NextResponse.json({
      products: productPayload,
      homepage: {
        products: groups,
        sellers: [],
      },
      groups,
      flashSaleEndsAt: flashSaleCampaign?.endsAt?.toISOString() ?? null,
      categories: categoryPayload,
      banners: banners.map((banner) => ({
        id: banner.id,
        title: banner.title,
        subtitle: banner.subtitle ?? '',
        image: banner.image,
        link: banner.link,
        button_text: banner.buttonText,
        buttonText: banner.buttonText,
      })),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    console.error('GET /api/shop-page error:', error);
    return NextResponse.json({ error: 'Failed to load homepage data' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
