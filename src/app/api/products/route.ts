import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/server';
import { raceWithTimeout } from '../_utils/route-timeout';
import {
  PRODUCT_STATUSES,
  getPublicPublishedProductWhere,
  normalizeJsonArray,
  productSellerInclude,
  requireApiUser,
  serializeProduct,
  slugify,
} from './shared';
import { associateProductMedia } from '@/lib/media';

export const runtime = 'nodejs';

const PAGINATION = {
  DEFAULT_LIMIT: 48,
  MAX_LIMIT: 100,
} as const;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawLimit = Number.parseInt(searchParams.get('limit') || '', 10);
    const category = (searchParams.get('category') || '').trim();
    const sellerId = (searchParams.get('seller_id') || '').trim();
    const search = (searchParams.get('q') || searchParams.get('search') || '').trim();

    const defaultLimit = PAGINATION.DEFAULT_LIMIT;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, PAGINATION.MAX_LIMIT) : defaultLimit;

    const rawPage = searchParams.get('page');
    const hasPagination = rawPage !== null && rawPage !== undefined && rawPage !== '';
    const requestedLimit = searchParams.has('limit');

    // Paged requests opt into an object payload ({ products, pagination }),
    // while legacy calls that omit `page` keep returning a plain array.
    const page = hasPagination
      ? Math.max(1, Math.floor(Number.parseInt(rawPage as string, 10) || 1))
      : 1;
    const skip = hasPagination ? (page - 1) * limit : 0;

    const where = getPublicPublishedProductWhere({
      ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
      ...(sellerId ? { sellerId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    });

    // Stable deterministic ordering so paged windows can't skip or duplicate rows.
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];

    if (hasPagination) {
      const [{ value: products, timedOut }, { value: total }] = await Promise.all([
        raceWithTimeout(
          prisma.product.findMany({
            where,
            include: productSellerInclude,
            orderBy,
            skip,
            take: limit,
          }),
          4000,
          [],
        ),
        raceWithTimeout(prisma.product.count({ where }), 4000, 0),
      ]);

      if (timedOut) {
        console.warn('GET /api/products timed out; returning empty storefront payload');
      }

      const productPayload = (products ?? []).map(serializeProduct);

      return NextResponse.json(
        {
          products: productPayload,
          pagination: {
            page,
            limit,
            total,
            hasMore: skip + productPayload.length < total,
          },
        },
        {
          headers: {
            'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
          },
        },
      );
    }

    const { value: products, timedOut } = await raceWithTimeout(
      prisma.product.findMany({
        where,
        include: productSellerInclude,
        orderBy,
        take: requestedLimit ? limit : defaultLimit,
      }),
      4000,
      [],
    );

    if (timedOut) {
      console.warn('GET /api/products timed out; returning empty storefront payload');
    }

    return NextResponse.json(
      (products ?? []).map(serializeProduct),
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
        },
      },
    );
  } catch (error) {
    console.error('GET /api/products error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const price = Number(body.price);

    if (!name || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: 'Name and valid price are required' }, { status: 400 });
    }

    const seller = await prisma.user.findUnique({
      where: { id: String(user.id) },
      select: { sellerStatus: true, role: true },
    });
    const productStatus =
      user.role === 'seller' && seller?.sellerStatus !== 'approved'
        ? PRODUCT_STATUSES.draft
        : PRODUCT_STATUSES.published;

    const product = await prisma.product.create({
      data: {
        name,
        slug: slugify(name),
        description: body.description ? String(body.description) : null,
        specifications: normalizeJsonArray(body.specifications),
        price,
        oldPrice: body.old_price || body.oldPrice ? Number(body.old_price ?? body.oldPrice) : price,
        image: body.image ? String(body.image) : null,
        galleryImages: normalizeJsonArray(body.gallery_images ?? body.galleryImages),
        videoUrl: body.video_url ? String(body.video_url).trim() : null,
        model3d: body.model_3d ? String(body.model_3d).trim() : null,
        category: body.category ? String(body.category).trim() : null,
        stock: Number(body.stock ?? 0),
        variantOptions: normalizeJsonArray(body.variant_options ?? body.variantOptions),
        resellerEnabled: Boolean(body.reseller_enabled ?? body.resellerEnabled),
        resellerBasePrice:
          body.reseller_base_price == null || body.reseller_base_price === ''
            ? null
            : Number(body.reseller_base_price),
        resellerSuggestedPrice:
          body.reseller_suggested_price == null || body.reseller_suggested_price === ''
            ? null
            : Number(body.reseller_suggested_price),
        resellerNotes: body.reseller_notes ? String(body.reseller_notes) : null,
        sellerId: String(user.id),
        productStatus,
        publishedAt: productStatus === PRODUCT_STATUSES.published ? new Date() : null,
      },
    });

    const mediaUrls = [
      product.image,
      product.videoUrl,
      product.model3d,
      ...(Array.isArray(product.galleryImages)
        ? product.galleryImages.filter((item): item is string => typeof item === 'string')
        : []),
    ].filter((item): item is string => Boolean(item));
    await associateProductMedia(product.id, String(user.id), mediaUrls);

    return NextResponse.json({
      success: true,
      productId: product.id,
      product_status: product.productStatus,
    });
  } catch (error) {
    console.error('POST /api/products error:', error);
    return NextResponse.json({ error: 'Failed to add product' }, { status: 500 });
  }
}
