import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';
import { recordOtpIssued, OTP_RESEND_COOLDOWN_SECONDS } from '@/features/auth/server/otp-policy';
import { isValidEmail, normalizeEmail } from '@/features/auth/services/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({ email: z.string().max(320) });

/**
 * Entry point for a new email account: the code is sent immediately, so the
 * user never has to press a separate "send OTP" button.
 *
 * The response only distinguishes "already a verified account" so the client
 * can move to the password step; every other outcome is deliberately vague to
 * avoid turning this endpoint into an account-enumeration oracle.
 */
export async function POST(request: NextRequest) {
  try {
    const body = Schema.parse(await request.json());
    const email = normalizeEmail(body.email);
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.', code: 'INVALID_EMAIL' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const { allowed } = await takeRateLimit(`auth:pre-register:${email}:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again in a few minutes.', code: 'RATE_LIMITED' },
        { status: 429 },
      );
    }

    const { prisma } = await import('@/lib/server');
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (existing?.emailVerified) {
      return NextResponse.json({ error: 'Account already exists. Please login.', code: 'ACCOUNT_EXISTS' }, { status: 409 });
    }

    const supabase = createSupabaseServerClient(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      console.error('[auth:pre-register-otp] send failed', error.message);
      return NextResponse.json(
        { error: "Couldn't send the verification code. Please try again.", code: 'SEND_FAILED' },
        { status: 400 },
      );
    }

    await recordOtpIssued('register', email);

    return NextResponse.json({ success: true, resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    console.error('[auth:pre-register-otp] unexpected failure', error);
    return NextResponse.json({ error: "Couldn't send the verification code.", code: 'UNKNOWN_ERROR' }, { status: 500 });
  }
}
