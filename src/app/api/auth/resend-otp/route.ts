import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import { AuthPurpose, sendEmailOtp, sendPhoneOtp, OTP_RESEND_COOLDOWN_SECONDS } from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ResendOtpSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  purpose: z.string().trim().min(1).max(64),
  phone: z.string().trim().max(20).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const body = ResendOtpSchema.parse(await request.json());
    const purpose = body.purpose as AuthPurpose;
    const clientIp = getClientIp(request);

    const rateLimitKey = `otp:resend:${purpose}:${body.identifier}:${clientIp}`;
    const { allowed } = await takeRateLimit(rateLimitKey, { limit: 3, windowMs: 5 * 60 * 1000 });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার OTP পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }

    const classified = classifyLoginIdentifier(body.identifier);
    if (classified.type === 'invalid') {
      return NextResponse.json({ success: true });
    }

    let email: string | null = null;
    if (classified.type === 'email') {
      email = classified.value;
    } else if (classified.type === 'phone') {
      const userId = await findUserIdByPhone(classified.value);
      if (!userId) {
        return NextResponse.json({ success: true });
      }
      const user = await findUserById(userId);
      email = user?.email ?? null;
    }

    if (email) {
      const result = await sendEmailOtp({ email, purpose });
      if (!result.success) {
        return NextResponse.json({ error: result.error, code: 'SEND_FAILED' }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        expiresAt: result.expiresAt,
        resendInSeconds: result.resendInSeconds,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'OTP অনুরোধ সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OTP পুনরায় পাঠানো ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}

async function findUserIdByPhone(phone: string): Promise<string | null> {
  const { prisma } = await import('@/lib/server');
  const user = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
  return user?.id ?? null;
}

async function findUserById(userId: string) {
  const { prisma } = await import('@/lib/server');
  return prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
}
