import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { requestPasswordReset } from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestResetSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
});

export async function POST(request: NextRequest) {
  try {
    const body = RequestResetSchema.parse(await request.json());
    const clientIp = getClientIp(request);
    const { allowed } = await takeRateLimit(`password:reset-request:${clientIp}`, {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const result = await requestPasswordReset(body.identifier);

    if (!result.success) {
      return NextResponse.json({ error: result.error, code: result.code ?? 'SEND_FAILED' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'পুনরায় সেট করার অনুরোধটি সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'পাসওয়ার্ড রিসেট অনুরোধ ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}
