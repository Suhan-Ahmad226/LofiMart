import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { prismaDirect } from '@/features/shared/services/database/prisma';
import { requireApiUser, requireRole } from '../../_compat/shared';
import { toPlainNumber } from '../../products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireReseller(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireRole(['reseller'])(user) || user;
}

export async function POST(request: NextRequest) {
  const user = await requireReseller(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const productId = String(body.product_id ?? body.productId ?? '').trim();
  const markupAmount = Number(body.markup_amount ?? 0);
  const resellerSalePrice =
    body.reseller_sale_price === null || body.reseller_sale_price === '' || typeof body.reseller_sale_price === 'undefined'
      ? null
      : Number(body.reseller_sale_price);

  if (!productId) {
    return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      resellerEnabled: true,
      resellerBasePrice: true,
    },
  });

  if (!product || !product.resellerEnabled) {
    return NextResponse.json(
      { error: 'Seller has not enabled reseller sales for this product.' },
      { status: 400 },
    );
  }

  const basePrice = Number(toPlainNumber(product.resellerBasePrice ?? 0) || 0);
  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    return NextResponse.json(
      { error: 'Seller reseller base price is not configured correctly.' },
      { status: 400 },
    );
  }

  const nextMarkup =
    resellerSalePrice !== null
      ? resellerSalePrice - basePrice
      : Number(markupAmount ?? 0);

  if (!Number.isFinite(nextMarkup) || nextMarkup < 0) {
    return NextResponse.json(
      { error: 'Reseller sale price cannot be lower than the seller base reseller price.' },
      { status: 400 },
    );
  }

  await prismaDirect.resellerMarkup.upsert({
    where: {
      resellerId_productId: {
        resellerId: String(user.id),
        productId,
      },
    },
    update: {
      markupAmount: nextMarkup,
    },
    create: {
      resellerId: String(user.id),
      productId,
      markupAmount: nextMarkup,
    },
  });

  return NextResponse.json({ success: true });
}
