import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import {
  PRODUCT_STATUSES,
  normalizeJsonArray,
  productSellerInclude,
  requireApiUser,
  serializeProduct,
  userCanManageProduct,
} from '../shared';
import { associateProductMedia, collectProductMedia, deleteManyMedia, enqueueMediaDelete, parseCloudinaryAssetUrl } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ slug: id }, { id }],
        productStatus: PRODUCT_STATUSES.published,
        seller: {
          role: 'seller',
          sellerStatus: 'approved',
          storefrontPublished: true,
          profileVisibility: { not: 'private' },
        },
      },
      include: productSellerInclude,
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' } });
    }

    return NextResponse.json(serializeProduct(product), {
      headers: {
        'Cache-Control': 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800',
      },
    });
  } catch (error) {
    console.error('GET /api/products/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  if (!(await userCanManageProduct(user, id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data: Record<string, unknown> = {};
    const beforeMedia = await collectProductMedia(id);

    if ('name' in body) data.name = String(body.name || '').trim();
    if ('description' in body) data.description = body.description ? String(body.description) : null;
    if ('price' in body) data.price = Number(body.price);
    if ('old_price' in body || 'oldPrice' in body) data.oldPrice = Number(body.old_price ?? body.oldPrice);
    if ('image' in body) data.image = body.image ? String(body.image) : null;
    if ('gallery_images' in body || 'galleryImages' in body) {
      data.galleryImages = normalizeJsonArray(body.gallery_images ?? body.galleryImages);
    }
    if ('video_url' in body || 'videoUrl' in body) data.videoUrl = body.video_url || body.videoUrl || null;
    if ('model_3d' in body || 'model3d' in body) data.model3d = body.model_3d || body.model3d || null;
    if ('category' in body) data.category = body.category ? String(body.category).trim() : null;
    if ('stock' in body) data.stock = Number(body.stock ?? 0);
    if ('variant_options' in body || 'variantOptions' in body) {
      data.variantOptions = normalizeJsonArray(body.variant_options ?? body.variantOptions);
    }
    if ('specifications' in body) data.specifications = normalizeJsonArray(body.specifications);
    if ('reseller_enabled' in body || 'resellerEnabled' in body) {
      data.resellerEnabled = Boolean(body.reseller_enabled ?? body.resellerEnabled);
    }
    if ('reseller_base_price' in body) {
      data.resellerBasePrice =
        body.reseller_base_price == null || body.reseller_base_price === '' ? null : Number(body.reseller_base_price);
    }
    if ('reseller_suggested_price' in body) {
      data.resellerSuggestedPrice =
        body.reseller_suggested_price == null || body.reseller_suggested_price === ''
          ? null
          : Number(body.reseller_suggested_price);
    }
    if ('reseller_notes' in body) data.resellerNotes = body.reseller_notes ? String(body.reseller_notes) : null;

    if (user.role === 'admin') {
      data.productStatus = PRODUCT_STATUSES.published;
      data.publishedAt = new Date();
    }

    await prisma.product.update({
      where: { id },
      data,
    });

    const product = await prisma.product.findUnique({
      where: { id },
      select: { sellerId: true, image: true, galleryImages: true, videoUrl: true, model3d: true },
    });

    if (product?.sellerId) {
      const nextUrls = [
        product.image,
        product.videoUrl,
        product.model3d,
        ...(Array.isArray(product.galleryImages) ? product.galleryImages.filter((item): item is string => typeof item === 'string') : []),
      ].filter((item): item is string => Boolean(item));
      await associateProductMedia(id, product.sellerId, nextUrls);

      const nextRefs = new Set(nextUrls.map((url) => parseCloudinaryAssetUrl(url)?.publicId).filter(Boolean));
      const removed = beforeMedia.filter((item) => item.publicId && !nextRefs.has(item.publicId));
      const cleanup = await deleteManyMedia(removed);
      for (const failed of cleanup.errors) {
        await enqueueMediaDelete({
          publicId: failed.item.publicId,
          url: failed.item.url,
          resourceType: failed.item.resourceType,
          reason: 'product-media-replaced',
          entityType: 'Product',
          entityId: id,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT /api/products/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  if (!(await userCanManageProduct(user, id))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const media = await collectProductMedia(id);
    await prisma.product.delete({ where: { id } });
    const cleanup = await deleteManyMedia(media);
    for (const failed of cleanup.errors) {
      await enqueueMediaDelete({
        publicId: failed.item.publicId,
        url: failed.item.url,
        resourceType: failed.item.resourceType,
        reason: 'product-deleted',
        entityType: 'Product',
        entityId: id,
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/products/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
