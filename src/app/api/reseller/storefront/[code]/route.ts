import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { serializeProduct, toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  if (!code) {
    return NextResponse.json({ error: 'Reseller storefront not found.' }, { status: 404 });
  }

  try {
    const referral = await prisma.resellerReferral.findUnique({
      where: { code: String(code) },
      include: { reseller: true },
    });

    const reseller = referral?.reseller;

    if (!reseller || reseller.role !== 'reseller' || reseller.storefrontPublished === false) {
      return NextResponse.json({ error: 'This reseller storefront is not available.' }, { status: 404 });
    }

    const markups = await prisma.resellerMarkup.findMany({
      where: { resellerId: reseller.id },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    const products = markups
      .filter((markup) => markup.product && markup.product.productStatus === 'published')
      .map((markup) => {
        const product = markup.product!;
        const basePrice = Number(toPlainNumber(product.resellerBasePrice ?? product.price) || 0);
        const markupAmount = Number(toPlainNumber(markup.markupAmount) || 0);
        const salePrice = Number((basePrice + markupAmount).toFixed(2));
        return {
          ...serializeProduct(product),
          price: salePrice,
          reseller_sale_price: salePrice,
          reseller_ref_code: String(code),
          reseller_enabled: true,
        };
      });

    const categories = Array.from(
      new Set(
        products
          .map((product) => product.category)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (referral) {
      void prisma.resellerReferral
        .update({
          where: { id: referral.id },
          data: { clicks: { increment: 1 } },
        })
        .catch(() => undefined);
    }

    return NextResponse.json({
      storefront: {
        code: String(code),
        reseller_id: reseller.id,
        reseller_name: reseller.name || 'Reseller',
        store_name: reseller.storeName || reseller.name || null,
        banner_url: reseller.storefrontBannerUrl || null,
        headline: reseller.storefrontHeadline || null,
        accent_color: reseller.storefrontAccentColor || '#0F766E',
        custom_domain: reseller.storefrontCustomDomain || null,
        is_published: Boolean(reseller.storefrontPublished ?? true),
        avatar_url: reseller.avatarUrl || null,
        bio: reseller.bio || null,
      },
      categories,
      products,
    });
  } catch (error) {
    console.error('GET /api/reseller/storefront/[code] error:', error);
    return NextResponse.json({ error: 'Failed to load reseller storefront' }, { status: 500 });
  }
}