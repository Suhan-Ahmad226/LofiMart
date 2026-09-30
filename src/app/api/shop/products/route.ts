import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server';
import {
  PRODUCT_STATUSES,
  getPublicApprovedSellerWhere,
  productSellerInclude,
  serializeProduct,
} from '../../products/shared';
import { raceWithTimeout } from '../../_utils/route-timeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const DEFAULT_SORT = 'featured';

type SortOption = 'featured' | 'price-low' | 'price-high' | 'rating' | 'discount';

type ProductFilters = {
  category?: string;
  q?: string;
  rating: number;
  maxPrice?: number;
};

function normalizeSort(value: string | null): SortOption {
  if (value === 'price-low' || value === 'price-high' || value === 'rating' || value === 'discount') {
    return value;
  }
  return DEFAULT_SORT;
}

function normalizePage(value: string | null): number {
  const page = Number.parseInt(value || '1', 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

function normalizeLimit(value: string | null): number {
  const limit = Number.parseInt(value || String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function normalizeRating(value: string | null): number {
  const rating = Number(value || 0);
  if (!Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

function normalizeMaxPrice(value: string | null): number | undefined {
  const price = Number(value || 0);
  if (!Number.isFinite(price) || price <= 0) {
    return undefined;
  }
  return Math.max(0, price);
}

function parseFilters(searchParams: URLSearchParams): ProductFilters {
  const rawCategory = (searchParams.get('category') || '').trim();
  const rawQuery = (searchParams.get('q') || searchParams.get('search') || '').trim();

  return {
    category: rawCategory || undefined,
    q: rawQuery || undefined,
    rating: normalizeRating(searchParams.get('rating')),
    maxPrice: normalizeMaxPrice(searchParams.get('price')),
  };
}

function buildProductWhere(filters: ProductFilters): Prisma.ProductWhereInput {
  const conditions: Prisma.ProductWhereInput[] = [
    { productStatus: PRODUCT_STATUSES.published },
    {
      OR: [
        { seller: { role: 'admin' } },
        { seller: getPublicApprovedSellerWhere() },
      ],
    },
  ];

  if (filters.category) {
    conditions.push({ category: { equals: filters.category, mode: 'insensitive' } });
  }

  if (filters.q) {
    conditions.push({
      OR: [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
        { category: { contains: filters.q, mode: 'insensitive' } },
        {
          seller: {
            OR: [
              { name: { contains: filters.q, mode: 'insensitive' } },
              { storeName: { contains: filters.q, mode: 'insensitive' } },
            ],
          },
        },
      ],
    });
  }

  if (filters.rating > 0) {
    conditions.push({ rating: { gte: filters.rating } });
  }

  if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
    conditions.push({ price: { lte: filters.maxPrice } });
  }

  return { AND: conditions };
}

function buildOrderBy(sort: SortOption): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price-low':
      return [{ price: 'asc' }, { createdAt: 'desc' }];
    case 'price-high':
      return [{ price: 'desc' }, { createdAt: 'desc' }];
    case 'rating':
      return [{ rating: 'desc' }, { reviewsCount: 'desc' }, { createdAt: 'desc' }];
    case 'discount':
      return [];
    default:
      return [{ reviewsCount: 'desc' }, { createdAt: 'desc' }];
  }
}

function buildProductFiltersSql(filters: ProductFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p."productStatus" = ${PRODUCT_STATUSES.published}`,
    Prisma.sql`(
      s."role" = 'admin'
      OR (
        s."role" = 'seller'
        AND s."sellerStatus" = 'approved'
        AND s."storefrontPublished" = true
        AND s."profileVisibility" <> 'private'
      )
    )`,
  ];

  if (filters.category) {
    conditions.push(Prisma.sql`p."category" ILIKE ${filters.category}`);
  }

  if (filters.q) {
    const query = `%${filters.q}%`;
    conditions.push(Prisma.sql`(
      p."name" ILIKE ${query}
      OR p."description" ILIKE ${query}
      OR p."category" ILIKE ${query}
      OR s."name" ILIKE ${query}
      OR s."storeName" ILIKE ${query}
    )`);
  }

  if (filters.rating > 0) {
    conditions.push(Prisma.sql`p."rating" >= ${filters.rating}`);
  }

  if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
    conditions.push(Prisma.sql`p."price" <= ${filters.maxPrice}`);
  }

  return Prisma.join(conditions, ' AND ');
}

async function fetchDiscountSortedProductIds(filters: ProductFilters, skip: number, limit: number) {
  const whereSql = buildProductFiltersSql(filters);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p."id"
    FROM "Product" p
    LEFT JOIN "User" s ON s."id" = p."sellerId"
    WHERE ${whereSql}
    ORDER BY (COALESCE(p."oldPrice", p."price") - p."price") DESC, p."createdAt" DESC
    LIMIT ${limit} OFFSET ${skip}
  `);

  return rows.map((row) => row.id);
}

async function fetchProductsByOrderedIds(ids: string[]) {
  if (ids.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: productSellerInclude,
  });

  const byId = new Map(products.map((product) => [product.id, product]));

  return ids
    .map((id) => byId.get(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));
}

function toFallbackCategories(products: unknown[]): Array<{ id: string; name: string; icon: string | null }> {
  return Array.from(
    new Set(
      products
        .map((product) => (product && typeof product === 'object' ? (product as { category?: unknown }).category : null))
        .filter((name): name is string => Boolean(name && typeof name === 'string')),
    ),
  ).map((name) => ({
    id: String(name).toLowerCase().replace(/\s+/g, '-'),
    name,
    icon: null,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sort = normalizeSort(searchParams.get('sort'));
    const page = normalizePage(searchParams.get('page'));
    const limit = normalizeLimit(searchParams.get('limit'));
    const skip = (page - 1) * limit;
    const filters = parseFilters(searchParams);
    const where = buildProductWhere(filters);

    const [{ value: categories }, { value: total }] = await Promise.all([
      raceWithTimeout(
        prisma.category.findMany({
          select: { id: true, name: true, icon: true },
          orderBy: { name: 'asc' },
        }),
        2500,
        [],
      ),
      raceWithTimeout(prisma.product.count({ where }), 4500, 0),
    ]);

    let products: Prisma.ProductGetPayload<{ include: typeof productSellerInclude }>[] = [];

    if (sort === 'discount') {
      const { value: orderedIds } = await raceWithTimeout(
        fetchDiscountSortedProductIds(filters, skip, limit),
        4500,
        [],
      );
      const { value: orderedProducts } = await raceWithTimeout(fetchProductsByOrderedIds(orderedIds), 4500, []);
      products = orderedProducts;
    } else {
      const result = await raceWithTimeout(
        prisma.product.findMany({
          where,
          include: productSellerInclude,
          orderBy: buildOrderBy(sort),
          skip,
          take: limit,
        }),
        4500,
        [],
      );
      products = result.value;
    }

    const productPayload = products.map(serializeProduct);

    const categoryPayload =
      categories.length > 0 ? categories : toFallbackCategories(productPayload);

    return NextResponse.json(
      {
        products: productPayload,
        categories: categoryPayload,
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + products.length < total,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
        },
      },
    );
  } catch (error) {
    console.error('GET /api/shop/products error:', error);
    return NextResponse.json(
      { error: 'Failed to load shop products' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}