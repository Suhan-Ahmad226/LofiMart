import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireAdminRole, requireApiUser } from '../../_compat/shared';
import { toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeCoupon(coupon: any) {
  return {
    id: coupon.id,
    code: coupon.code,
    seller_id: coupon.sellerId ?? null,
    seller_name: coupon.seller?.storeName ?? coupon.seller?.name ?? null,
    discount_type: coupon.discountType,
    discount_value: toPlainNumber(coupon.discountValue),
    min_order_value: toPlainNumber(coupon.minOrderValue),
    expiry_date: coupon.expiryDate.toISOString(),
    created_at: coupon.createdAt ? new Date(coupon.createdAt).toISOString() : undefined,
  };
}

async function requireAdmin(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  return requireAdminRole(user) || user;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const coupons = await prisma.coupon.findMany({
    include: {
      seller: { select: { id: true, name: true, storeName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(coupons.map(serializeCoupon));
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const discountType = String(body.discount_type || body.discountType || '').trim();
  const discountValue = Number(body.discount_value ?? body.discountValue);
  const minOrderValue = Number(body.min_order_value ?? body.minOrderValue ?? 0);
  const expiryDate = body.expiry_date ?? body.expiryDate;

  if (!code) {
    return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 });
  }
  if (!['percentage', 'fixed'].includes(discountType)) {
    return NextResponse.json({ error: 'discount_type must be percentage or fixed' }, { status: 400 });
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: 'A valid discount value is required' }, { status: 400 });
  }
  if (!expiryDate) {
    return NextResponse.json({ error: 'Expiry date is required' }, { status: 400 });
  }

  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 });
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      discountType,
      discountValue,
      minOrderValue,
      expiryDate: expiry,
    },
    include: {
      seller: { select: { id: true, name: true, storeName: true } },
    },
  });

  return NextResponse.json(serializeCoupon(coupon), { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '').trim();

  if (!id) {
    return NextResponse.json({ error: 'ID is required' }, { status: 400 });
  }

  await prisma.coupon.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
