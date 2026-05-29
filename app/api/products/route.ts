import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import {
  PRODUCT_STATUSES,
  getPublicPublishedProductWhere,
  normalizeJsonArray,
  productSellerInclude,
  requireApiUser,
  serializeProduct,
  slugify,
} from './shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Number.parseInt(searchParams.get('limit') || '', 10);
    const category = (searchParams.get('category') || '').trim();
    const sellerId = (searchParams.get('seller_id') || '').trim();
    const search = (searchParams.get('q') || searchParams.get('search') || '').trim();

    const products = await prisma.product.findMany({
      where: getPublicPublishedProductWhere({
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
      }),
      include: productSellerInclude,
      orderBy: { createdAt: 'desc' },
      ...(Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
    });

    return NextResponse.json(products.map(serializeProduct));
  } catch (error) {
    console.error('GET /api/products error:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
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
