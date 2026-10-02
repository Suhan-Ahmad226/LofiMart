import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  identifier: z.string().trim().min(1).max(320),
});

export async function POST(request: NextRequest) {
  try {
    const body = Schema.parse(await request.json());
    const classified = classifyLoginIdentifier(body.identifier);

    if (classified.type === 'invalid') {
      return NextResponse.json({ flow: 'invalid' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const { allowed } = await takeRateLimit(
      `auth:identifier-flow:${classified.type}:${classified.value}:${ip}`,
      { limit: 10, windowMs: 5 * 60 * 1000 },
    );

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }

    const user =
      classified.type === 'email'
        ? await prisma.user.findUnique({
            where: { email: classified.value },
            select: { email: true, emailVerified: true, isBlocked: true, deactivatedAt: true },
          })
        : await prisma.user.findFirst({
            where: { phone: classified.value },
            select: { email: true, emailVerified: true, isBlocked: true, deactivatedAt: true },
          });

    if (!user) {
      if (classified.type === 'phone') {
        return NextResponse.json({
          flow: 'registration-email-required',
          message: 'New LofiMart accounts use email verification. Please enter an email address to create your account.',
        });
      }

      return NextResponse.json({ flow: 'register', email: classified.value });
    }

    if (user.isBlocked || user.deactivatedAt) {
      return NextResponse.json(
        { error: 'এই অ্যাকাউন্টটি সক্রিয় নয়।', code: 'ACCOUNT_INACTIVE' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      flow: 'login',
      identifier: classified.type === 'email' ? classified.value : user.email,
      maskedEmail: maskEmail(user.email),
      emailVerified: user.emailVerified,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Email or phone number is required.', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to determine authentication flow.' },
      { status: 500 },
    );
  }
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}
