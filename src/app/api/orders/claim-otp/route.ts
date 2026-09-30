import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/app/api/products/shared';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { sendGuestClaimOtp } from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ClaimOtpSchema = z.object({
  orderId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    if (user instanceof NextResponse) return user;

    const body = ClaimOtpSchema.parse(await request.json());
    const clientIp = getClientIp(request);
    const { allowed } = await takeRateLimit(`orders:claim-otp:${body.orderId}:${clientIp}`, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার OTP পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }

    const result = await sendGuestClaimOtp(body.orderId);

    if (!result.success) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      expiresAt: result.expiresAt,
      hasPhone: result.hasPhone,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Claim অনুরোধটি সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Claim OTP পাঠানো ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}
