import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { normalizeBdPhone, normalizeEmail } from '@/features/auth/services/identity';
import { createMarketplaceOrder } from '@/features/telegram_bot/lib/orderService';
import { serializeOrder } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GuestOrderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]).optional(),
        productId: z.union([z.string(), z.number()]).optional(),
        quantity: z.union([z.number(), z.string()]).optional(),
        qty: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .min(1),
  email: z.string().max(320),
  phone: z.string().min(1).max(20),
  paymentMethod: z.string().optional(),
  shippingAddress: z.unknown().optional(),
  fullAddressSummary: z.unknown().optional(),
  couponCode: z.string().optional(),
  refCode: z.string().optional(),
  idempotencyKey: z.string().min(16).max(128).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = GuestOrderSchema.parse(await request.json());

    const email = normalizeEmail(body.email);
    const phone = normalizeBdPhone(body.phone);
    if (!email || !phone) {
      return NextResponse.json(
        { error: 'Guest checkout requires a valid email and a valid Bangladesh phone number.' },
        { status: 400 },
      );
    }

    const clientIp = getClientIp(request);
    const { allowed } = await takeRateLimit(`orders:guest:${clientIp}`, {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার অর্ডার করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const items = body.items
      .map((item: { id?: string | number; productId?: string | number; quantity?: string | number; qty?: string | number }) => ({
        productId: String(item.id || item.productId || ''),
        quantity: Math.max(1, Number(item.quantity ?? item.qty ?? 1)),
      }))
      .filter((item: { productId: string; quantity: number }) =>
        item.productId && Number.isFinite(item.quantity),
      );

    if (items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

    const order = await createMarketplaceOrder({
      guestEmail: email,
      guestPhone: phone,
      paymentMethod: String(body.paymentMethod || 'cod'),
      refCode: body.refCode ? String(body.refCode) : undefined,
      shippingAddress: body.shippingAddress || body.fullAddressSummary || null,
      couponCode: body.couponCode ? String(body.couponCode) : undefined,
      items,
      idempotencyKey: body.idempotencyKey || crypto.randomUUID(),
    });

    return NextResponse.json(
      {
        success: true,
        guest: true,
        id: order?.id,
        orderId: order?.orderCode || order?.id,
        order_code: order?.orderCode,
        order: serializeOrder(order),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Guest অর্ডারের তথ্য সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create guest order',
      },
      { status: 400 },
    );
  }
}
