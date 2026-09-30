import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { verifyPhoneToken } from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const clientIp = getClientIp(request);
  const { allowed } = await takeRateLimit(`verify-phone:verify:${user.id}:${clientIp}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
      { status: 429, headers: { 'Retry-After': '900' } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const submittedCode = String(body?.code || '').trim();

  if (!submittedCode || submittedCode.length < 6) {
    return NextResponse.json({ error: 'A valid verification code is required' }, { status: 400 });
  }

  const result = await verifyPhoneToken(String(user.id), submittedCode);

  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
