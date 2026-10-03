import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import {
  isAuthPurpose,
  verifyEmailOtp,
  verifySmsOtp,
  markEmailVerified,
  markPhoneVerified,
  resolvePasswordResetEmail,
} from '@/features/auth/server/auth-service';
import { evaluateOtpVerification } from '@/features/auth/server/otp-policy';
import { attachPasswordResetSessionCookie, createPasswordResetSession } from '@/features/auth/server/reset-session';
import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VerifyOtpSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  purpose: z.string().trim().min(1).max(64),
  pin: z.string().trim().min(6).max(8),
});

/** User-facing copy for each OTP failure. Never leaks provider internals. */
const VERIFY_MESSAGES: Record<string, string> = {
  INVALID: 'Incorrect verification code.',
  EXPIRED: 'Your verification code has expired. Please request a new one.',
  MAX_ATTEMPTS: 'Too many attempts. Please request a new code.',
};

function otpFailure(code: keyof typeof VERIFY_MESSAGES | string, retryAfterSeconds = 0) {
  const status = code === 'MAX_ATTEMPTS' ? 429 : 400;
  const headers = retryAfterSeconds > 0 ? { 'Retry-After': String(retryAfterSeconds) } : undefined;

  return NextResponse.json(
    { error: VERIFY_MESSAGES[code] ?? VERIFY_MESSAGES.INVALID, code },
    headers ? { status, headers } : { status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = VerifyOtpSchema.parse(await request.json());

    if (!isAuthPurpose(body.purpose)) {
      return NextResponse.json(
        { error: 'OTP purpose is not supported.', code: 'INVALID_PURPOSE' },
        { status: 400 },
      );
    }

    const purpose = body.purpose;

    if (purpose === 'guest_claim') {
      return NextResponse.json(
        { error: 'This verification code cannot be used here.', code: 'CLAIM_SCOPE_REQUIRED' },
        { status: 400 },
      );
    }

    const classified = classifyLoginIdentifier(body.identifier);
    if (classified.type === 'invalid') {
      return otpFailure('INVALID');
    }

    const clientIp = getClientIp(request);

    // Per-IP throttling protects the endpoint itself; the policy below is what
    // actually limits how often one code can be guessed.
    const { allowed } = await takeRateLimit(`otp:verify:${purpose}:${classified.value}:${clientIp}`, {
      limit: 10,
      windowMs: 5 * 60 * 1000,
    });

    if (!allowed) {
      return otpFailure('MAX_ATTEMPTS', 300);
    }

    const policy = await evaluateOtpVerification({ purpose, identifier: classified.value });
    if (!policy.allowed) {
      return otpFailure(policy.code, policy.retryAfterSeconds);
    }

    // Registration OTPs are issued by Supabase Auth. Verification still goes
    // through this server endpoint so attempts are rate-limited server-side and
    // the browser never becomes the security boundary.
    if (purpose === 'register') {
      if (classified.type !== 'email') {
        return otpFailure('INVALID');
      }

      const supabase = createSupabaseServerClient(false);
      const { data, error } = await supabase.auth.verifyOtp({
        email: classified.value,
        token: body.pin,
        type: 'email',
      });

      if (error || !data.session) {
        const message = String(error?.message || '').toLowerCase();
        return otpFailure(message.includes('expired') ? 'EXPIRED' : 'INVALID');
      }

      return NextResponse.json({
        success: true,
        verified: 'register',
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
        },
      });
    }

    if (purpose === 'reset_password') {
      const resetEmail = await resolvePasswordResetEmail(body.identifier);
      if (!resetEmail) {
        return otpFailure('INVALID');
      }

      const result = await verifyEmailOtp(resetEmail, body.pin);
      if (!result.verified) {
        return otpFailure('INVALID');
      }

      const resetSession = await createPasswordResetSession({
        email: resetEmail,
        supabaseAuthId: result.supabaseUserId,
      });
      const response = NextResponse.json({
        success: true,
        verified: purpose,
        resetSession: true,
        expiresInSeconds: resetSession.expiresInSeconds,
      });

      attachPasswordResetSessionCookie(response, resetSession.token);
      return response;
    }

    let verified = false;
    let supabaseUserId: string | null = null;
    let verifiedEmail: string | null = null;
    let verifiedPhone: string | null = null;

    if (classified.type === 'email') {
      const result = await verifyEmailOtp(classified.value, body.pin);
      if (result.verified) {
        verified = true;
        verifiedEmail = classified.value;
        supabaseUserId = result.supabaseUserId;
      }
    } else if (classified.type === 'phone') {
      const result = await verifySmsOtp(classified.value, body.pin);
      if (result.verified) {
        verified = true;
        verifiedPhone = classified.value;
      }
    }

    if (!verified) {
      return otpFailure('INVALID');
    }

    if (verifiedEmail) {
      if (purpose === 'verify_email') {
        const userId = await findUserIdByEmail(verifiedEmail);
        if (userId) {
          await markEmailVerified(userId, supabaseUserId);
          return NextResponse.json({ success: true, verified: 'email' });
        }
        return NextResponse.json({ success: true, verified: 'email' });
      }

      return NextResponse.json({ success: true, verified: purpose });
    }

    if (verifiedPhone && purpose === 'verify_phone') {
      const userId = await findUserIdByPhone(verifiedPhone);
      if (userId) {
        await markPhoneVerified(userId);
        return NextResponse.json({ success: true, verified: 'phone' });
      }
      return NextResponse.json({ success: true, verified: 'phone' });
    }

    return NextResponse.json({ success: true, verified: purpose });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Enter the 6-digit code.', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    console.error('[auth:verify-otp] unexpected failure', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { prisma } = await import('@/lib/server');
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user?.id ?? null;
}

async function findUserIdByPhone(phone: string): Promise<string | null> {
  const { prisma } = await import('@/lib/server');
  const user = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
  return user?.id ?? null;
}
