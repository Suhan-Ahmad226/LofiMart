import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { z } from 'zod';

const ValidateCouponSchema = z.object({
  code: z.string().min(1),
  cartTotal: z.number().positive().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, cartTotal } = ValidateCouponSchema.parse(body);

    const coupon = await prisma.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      return NextResponse.json(
        { success: false, error: 'Coupon not found' },
        { status: 404 }
      );
    }

    // Check if coupon is valid
    const now = new Date();
    if (coupon.expiryDate < now) {
      return NextResponse.json(
        { success: false, error: 'Coupon has expired' },
        { status: 400 }
      );
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (cartTotal || 0) * (Number(coupon.discountValue) / 100);
    } else {
      discountAmount = Number(coupon.discountValue);
    }

    // Check minimum order value
    if (cartTotal && Number(coupon.minOrderValue) > cartTotal) {
      return NextResponse.json(
        { success: false, error: `Minimum order value is ${coupon.minOrderValue}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        discountAmount,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: error.issues },
        { status: 400 }
      );
    }
    console.error('POST /api/v2/coupons/validate error:', error);
    return NextResponse.json(
      { success: false, error: 'Validation failed' },
      { status: 500 }
    );
  }
}
