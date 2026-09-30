import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import {
  getPublicApprovedSellerWhere,
  productSellerInclude,
  serializeProduct,
  toPlainNumber,
} from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicCampaignStatuses = ['active', 'published', 'scheduled'];
const publicEntryStatuses = ['approved', 'active', 'published'];

function serializeStorefrontCampaign(campaign: any) {
  return {
    id: campaign.id,
    title: campaign.title,
    slug: campaign.slug,
    banner_image: campaign.bannerImage ?? null,
    ends_at: campaign.endsAt ? new Date(campaign.endsAt).toISOString() : null,
  };
}

function serializeStorefrontEntry(entry: any) {
  return {
    id: entry.id,
    sale_price: toPlainNumber(entry.salePrice) ?? 0,
    allocated_stock: entry.allocatedStock ?? 0,
    campaign: serializeStorefrontCampaign(entry.campaign),
    product: entry.product ? serializeProduct(entry.product) : null,
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const trimmedSlug = String(slug || '').trim();

    if (!trimmedSlug) {
      return NextResponse.json({ error: 'Storefront not found.' }, { status: 404 });
    }

    const seller = await prisma.user.findFirst({
      where: {
        role: 'seller',
        storefrontSlug: trimmedSlug,
      },
      select: {
        id: true,
        name: true,
        storeName: true,
        storefrontSlug: true,
        storefrontBannerUrl: true,
        storefrontHeadline: true,
        storefrontAccentColor: true,
        storefrontCustomDomain: true,
        avatarUrl: true,
        bio: true,
        responseTimeHours: true,
        sellerStatus: true,
        storefrontPublished: true,
        profileVisibility: true,
        isBlocked: true,
        deactivatedAt: true,
        verificationSubmission: {
          select: { status: true },
        },
      },
    });

    if (!seller) {
      return NextResponse.json({ error: 'Storefront not found.' }, { status: 404 });
    }

    const isLive =
      seller.sellerStatus === 'approved' &&
      seller.storefrontPublished === true &&
      seller.profileVisibility !== 'private' &&
      !seller.isBlocked &&
      seller.deactivatedAt === null;

    if (!isLive) {
      return NextResponse.json(
        {
          seller_status: seller.sellerStatus || 'pending_review',
          storefront: {
            store_name: seller.storeName || seller.name || null,
          },
        },
        { status: 423 },
      );
    }

    const [products, coupons, flashSaleEntries] = await Promise.all([
      prisma.product.findMany({
        where: {
          sellerId: seller.id,
          productStatus: 'published',
        },
        orderBy: { createdAt: 'desc' },
        include: productSellerInclude,
      }),
      prisma.coupon.findMany({
        where: {
          sellerId: seller.id,
          expiryDate: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.flashSaleEntry.findMany({
        where: {
          sellerId: seller.id,
          status: { in: publicEntryStatuses },
          product: { productStatus: 'published' },
          campaign: {
            status: { in: publicCampaignStatuses },
            endsAt: { gt: new Date() },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: true,
          product: { include: productSellerInclude },
        },
      }),
    ]);

    const categories = Array.from(
      new Set(
        products
          .map((product) => product.category)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const productCount = products.length;
    const averageRating =
      productCount > 0
        ? products.reduce((sum, product) => sum + (product.rating || 0), 0) / productCount
        : 0;

    return NextResponse.json(
      {
        storefront: {
          seller_id: seller.id,
          seller_name: seller.name || 'Marketplace seller',
          store_name: seller.storeName || seller.name || '',
          slug: seller.storefrontSlug!,
          banner_url: seller.storefrontBannerUrl || null,
          headline: seller.storefrontHeadline || null,
          accent_color: seller.storefrontAccentColor || '#0F766E',
          custom_domain: seller.storefrontCustomDomain || null,
          avatar_url: seller.avatarUrl || null,
          bio: seller.bio || null,
          response_time_hours: seller.responseTimeHours ?? null,
          verification_badge: seller.verificationSubmission?.status === 'verified',
          seller_rating: Number(averageRating.toFixed(2)),
        },
        categories,
        coupons: coupons
          .filter(
            (coupon) => (toPlainNumber(coupon.discountValue) ?? 0) > 0 && coupon.code.trim().length > 0,
          )
          .map((coupon) => ({
            id: coupon.id,
            code: coupon.code,
            seller_id: coupon.sellerId ?? null,
            discount_type: coupon.discountType,
            discount_value: toPlainNumber(coupon.discountValue) ?? 0,
            min_order_value: toPlainNumber(coupon.minOrderValue) ?? 0,
            expiry_date: new Date(coupon.expiryDate).toISOString(),
          })),
        products: products.map(serializeProduct),
        flash_sale_entries: flashSaleEntries.map(serializeStorefrontEntry),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    console.error('GET /api/storefronts/[slug] error:', error);
    return NextResponse.json({ error: 'Failed to load seller storefront' }, { status: 500 });
  }
}