import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import { isAuthPurpose, verifyEmailOtp, verifySmsOtp, markEmailVerified, markPhoneVerified, resolvePasswordResetEmail, OTP_MAX_ATTEMPTS } from '@/features/auth/server/auth-service';
import { attachPasswordResetSessionCookie, createPasswordResetSession } from '@/features/auth/server/reset-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VerifyOtpSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  purpose: z.string().trim().min(1).max(64),
  pin: z.string().trim().min(6).max(8),
});

const VERIFY_MESSAGES: Record<string, string> = {
  INVALID: 'OTP সঠিক নয়। আবার চেষ্টা করুন।',
  EXPIRED: 'OTP-এর মেয়াদ শেষ হয়েছে। নতুন OTP পাঠান।',
  MAX_ATTEMPTS: 'অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন OTP পাঠান।',
};

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
        { error: 'অর্ডার claim করতে ভেরিফিকেশন কোডটি তার নির্ধারিত জায়গায় ব্যবহার করুন।', code: 'CLAIM_SCOPE_REQUIRED' },
        { status: 400 },
      );
    }

    const classified = classifyLoginIdentifier(body.identifier);
    if (classified.type === 'invalid') {
      return NextResponse.json({ error: VERIFY_MESSAGES.INVALID, code: 'INVALID' }, { status: 400 });
    }

    const clientIp = getClientIp(request);
    const rateLimitKey = `otp:verify:${purpose}:${classified.value}:${clientIp}`;
    const { allowed } = await takeRateLimit(rateLimitKey, { limit: OTP_MAX_ATTEMPTS, windowMs: 5 * 60 * 1000 });

    if (!allowed) {
      return NextResponse.json(
        { error: VERIFY_MESSAGES.MAX_ATTEMPTS, code: 'MAX_ATTEMPTS' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }

    if (purpose === 'reset_password') {
      const resetEmail = await resolvePasswordResetEmail(body.identifier);
      if (!resetEmail) {
        return NextResponse.json({ error: VERIFY_MESSAGES.INVALID, code: 'INVALID' }, { status: 400 });
      }

      const result = await verifyEmailOtp(resetEmail, body.pin);
      if (!result.verified) {
        return NextResponse.json({ error: VERIFY_MESSAGES.INVALID, code: 'INVALID' }, { status: 400 });
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
      return NextResponse.json({ error: VERIFY_MESSAGES.INVALID, code: 'INVALID' }, { status: 400 });
    }

    if (verifiedEmail) {
      if (purpose === 'register' || purpose === 'verify_email') {
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
      return NextResponse.json({ error: 'OTP অনুরোধ সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OTP যাচাই ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
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
