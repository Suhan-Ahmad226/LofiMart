import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { sendPhoneVerification } from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const clientIp = getClientIp(request);
  const { allowed } = await takeRateLimit(`verify-phone:req:${user.id}:${clientIp}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'অনেকবার OTP পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': '900' } },
    );
  }

  const result = await sendPhoneVerification(String(user.id));

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    expiresAt: result.expiresAt,
  });
}
