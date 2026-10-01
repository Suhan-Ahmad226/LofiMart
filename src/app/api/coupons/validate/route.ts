import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const rawOrderValue = Number(body.orderValue ?? body.cartTotal ?? 0);
  const orderValue = Number.isFinite(rawOrderValue) ? Math.max(0, rawOrderValue) : 0;

  if (!code) {
    return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 });
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code },
    include: {
      seller: {
        select: { id: true, name: true, storeName: true },
      },
    },
  });

  if (!coupon) {
    return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
  }

  if (coupon.expiryDate < new Date()) {
    return NextResponse.json({ error: 'Coupon has expired' }, { status: 400 });
  }

  const minOrderValue = Number(coupon.minOrderValue ?? 0);
  if (orderValue > 0 && minOrderValue > orderValue) {
    return NextResponse.json({ error: `Minimum order value is ${minOrderValue}` }, { status: 400 });
  }

  const discountType = String(coupon.discountType || '').toLowerCase() === 'percentage' ? 'percentage' : 'flat';
  const discountValue = Number(coupon.discountValue ?? 0);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: 'Coupon has an invalid discount value' }, { status: 400 });
  }
  if (discountType === 'percentage' && discountValue > 100) {
    return NextResponse.json({ error: 'Percentage discount cannot exceed 100%' }, { status: 400 });
  }
  const rawDiscountAmount = discountType === 'percentage' ? (orderValue * discountValue) / 100 : discountValue;
  const discountAmount = Math.min(orderValue, Math.max(0, rawDiscountAmount));

  return NextResponse.json({
    code: coupon.code,
    discount_type: discountType,
    discount_value: discountValue,
    discount_amount: discountAmount,
    discountAmount,
    seller_id: coupon.sellerId ?? null,
    seller_name: coupon.seller?.storeName || coupon.seller?.name || null,
  });
}
