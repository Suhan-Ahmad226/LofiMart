import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { resetPasswordWithVerifiedSession } from '@/features/auth/server/auth-service';
import { clearPasswordResetSessionCookie, PASSWORD_RESET_SESSION_COOKIE } from '@/features/auth/server/reset-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ResetPasswordSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  token: z.string().trim().min(1).max(200).optional(),
  newPassword: z.string().min(8).max(256),
});

function validatePassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

export async function POST(request: NextRequest) {
  try {
    const body = ResetPasswordSchema.parse(await request.json());

    if (!validatePassword(body.newPassword)) {
      return NextResponse.json(
        { error: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে এবং এতে অক্ষর ও সংখ্যা থাকতে হবে।', code: 'PASSWORD_POLICY' },
        { status: 400 },
      );
    }

    const clientIp = getClientIp(request);
    const { allowed } = await takeRateLimit(`password:reset:${clientIp}`, { limit: 5, windowMs: 15 * 60 * 1000 });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    const result = await resetPasswordWithVerifiedSession({
      identifier: body.identifier,
      resetSessionToken: request.cookies.get(PASSWORD_RESET_SESSION_COOKIE)?.value ?? null,
      newPassword: body.newPassword,
    });

    if (!result.success) {
      const status = result.code === 'PASSWORD_SYNC_FAILED' ? 502 : 400;
      const response = NextResponse.json({ error: result.error, code: result.code }, { status });
      if (result.code === 'RESET_SESSION_INVALID' || result.code === 'INVALID_RESET') {
        clearPasswordResetSessionCookie(response);
      }
      return response;
    }

    const response = NextResponse.json({ success: true });
    clearPasswordResetSessionCookie(response);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'পাসওয়ার্ড রিসেট অনুরোধটি সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'পাসওয়ার্ড রিসেট ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}
