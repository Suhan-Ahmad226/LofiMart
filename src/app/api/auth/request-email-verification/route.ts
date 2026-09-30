import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import { sendEmailOtp, OTP_RESEND_COOLDOWN_SECONDS } from '@/features/auth/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RequestEmailVerificationSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
});

export async function POST(request: NextRequest) {
  try {
    const body = RequestEmailVerificationSchema.parse(await request.json());
    const clientIp = getClientIp(request);

    const identifier = classifyLoginIdentifier(body.identifier);
    const genericResponse = { success: true };

    const rawKey =
      identifier.type === 'phone'
        ? `phone:${identifier.value}`
        : identifier.type === 'email'
          ? `email:${identifier.value.toLowerCase()}`
          : `invalid:${String(body.identifier || '').toLowerCase()}`;
    const rateLimitKey = `email-verify:req:${rawKey}:${clientIp}`;
    const { allowed } = await takeRateLimit(rateLimitKey, { limit: 5, windowMs: 15 * 60 * 1000 });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }

    if (identifier.type === 'invalid') {
      return NextResponse.json(genericResponse);
    }

    let email: string | null = null;

    if (identifier.type === 'email') {
      email = identifier.value;
    } else if (identifier.type === 'phone') {
      const userId = await findUserIdByPhone(identifier.value);
      if (userId) {
        const user = await findUserById(userId);
        email = user?.email ?? null;
      }
    }

    if (!email) {
      return NextResponse.json(genericResponse);
    }

    const user = await findUserByEmail(email);
    if (!user || user.emailVerified) {
      return NextResponse.json(genericResponse);
    }

    const result = await sendEmailOtp({ email, purpose: 'verify_email' });
    if (!result.success) {
      return NextResponse.json(genericResponse);
    }

    return NextResponse.json({
      success: true,
      expiresAt: result.expiresAt,
      resendInSeconds: result.resendInSeconds,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'ইমেইল যাচাইয়ের অনুরোধটি সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'ইমেইল যাচাইয়ের অনুরোধ ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
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
  return prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
}

async function findUserByEmail(email: string) {
  const { prisma } = await import('@/lib/server');
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
}
