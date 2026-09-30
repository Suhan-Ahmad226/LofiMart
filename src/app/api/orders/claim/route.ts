import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/app/api/products/shared';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { verifyGuestClaim } from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ClaimOrderSchema = z.object({
  orderId: z.string().min(1),
  pin: z.string().trim().min(6).max(8),
});

const VERIFY_MESSAGES: Record<string, string> = {
  INVALID: 'OTP সঠিক নয়। আবার চেষ্টা করুন।',
  EXPIRED: 'OTP-এর মেয়াদ শেষ হয়েছে। নতুন OTP পাঠান।',
  MAX_ATTEMPTS: 'অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন OTP পাঠান।',
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    if (user instanceof NextResponse) return user;

    const body = ClaimOrderSchema.parse(await request.json());
    const clientIp = getClientIp(request);
    const { allowed } = await takeRateLimit(`orders:claim:${clientIp}`, {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const result = await verifyGuestClaim({
      orderId: body.orderId,
      userId: String(user.id),
      token: body.pin,
    });

    if (!result.success) {
      const message = VERIFY_MESSAGES[result.code ?? ''] || result.error;
      const status = result.code === 'ALREADY_CLAIMED' ? 409 : 400;
      return NextResponse.json({ error: message, code: result.code }, { status });
    }

    return NextResponse.json({ success: true, orderId: body.orderId, claimable: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Claim অনুরোজটি সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'অর্ডার claim করা ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}
