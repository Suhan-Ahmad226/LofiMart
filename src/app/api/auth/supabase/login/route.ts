import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server';
import { createClient as createSupabaseBrowserClient } from '@/lib/client';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import {
  createLocalUserFromSupabase,
  formatAuthUser,
} from '../shared';
import { ensureRedis } from '@/features/shared/services/messaging/redis';
import { getServerEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LoginSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
  redirectTarget: z.string().optional(),
});

const GENERIC_CREDENTIALS_ERROR = 'ইমেইল অথবা ফোন নম্বর অথবা পাসওয়ার্ড সঠিক নয়।';

export async function POST(request: NextRequest) {
  try {
    const body = LoginSchema.parse(await request.json());
    const identifier = classifyLoginIdentifier(body.identifier);
    const clientIp = getClientIp(request);

    if (identifier.type === 'invalid') {
      return NextResponse.json({ error: GENERIC_CREDENTIALS_ERROR, code: 'INVALID_CREDENTIALS' }, { status: 401 });
    }

    const rateLimitKey = `login:${identifier.type}:${identifier.value}:${clientIp}`;
    const { allowed } = await takeRateLimit(rateLimitKey, { limit: 10, windowMs: 5 * 60 * 1000 });

    if (!allowed) {
      return NextResponse.json(
        { error: 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }

    let email: string;
    if (identifier.type === 'email') {
      email = identifier.value;
    } else {
      const phoneUser = await prisma.user.findFirst({
        where: { phone: identifier.value },
        select: { email: true },
      });

      if (!phoneUser) {
        return NextResponse.json({ error: GENERIC_CREDENTIALS_ERROR, code: 'INVALID_CREDENTIALS' }, { status: 401 });
      }

      email = phoneUser.email;
    }

    const supabase = await import('@/lib/server').then((m) => m.createClient());
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: body.password });

    if (error) {
      const message = String(error.message || '').toLowerCase();

      if (message.includes('email not confirmed')) {
        return NextResponse.json(
          {
            error: 'আপনার ইমেইল এখনো যাচাই করা হয়নি। আগে ইমেইল যাচাই করে আবার লগইন করুন।',
            code: 'EMAIL_NOT_VERIFIED',
            identifier: email,
          },
          { status: 403 },
        );
      }

      if (message.includes('invalid login credentials')) {
        return NextResponse.json({ error: GENERIC_CREDENTIALS_ERROR, code: 'INVALID_CREDENTIALS' }, { status: 401 });
      }

      return NextResponse.json({ error: 'লগইন সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।', code: 'LOGIN_FAILED' }, { status: 400 });
    }

    const supabaseUser = data.user;
    if (!supabaseUser?.email || !data.session?.access_token || !data.session.refresh_token) {
      return NextResponse.json({ error: 'লগইন সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।', code: 'LOGIN_FAILED' }, { status: 400 });
    }

    const verifiedAt = supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null;

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await createLocalUserFromSupabase({
        email,
        role: 'customer',
        emailVerified: Boolean(verifiedAt),
        emailVerifiedAt: verifiedAt,
        supabaseAuthId: supabaseUser.id,
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: user.emailVerified || Boolean(verifiedAt),
          emailVerifiedAt: user.emailVerifiedAt || verifiedAt,
          supabaseAuthId: user.supabaseAuthId || supabaseUser.id,
        },
      });
    }

    if (user.isBlocked || user.deactivatedAt) {
      return NextResponse.json({ error: 'এই অ্যাকাউন্টটি সক্রিয় নয়।' }, { status: 403 });
    }

    return NextResponse.json({
      user: formatAuthUser({
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
        alternatePhone: user.alternatePhone,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        storeName: user.storeName,
        storefrontSlug: user.storefrontSlug,
        storefrontBannerUrl: user.storefrontBannerUrl,
        storefrontHeadline: user.storefrontHeadline,
        sellerStatus: user.sellerStatus ?? 'draft',
        points: user.points ?? 0,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
      }),
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'লগইন অনুরোধটি সঠিক নয়।', code: 'VALIDATION_ERROR', details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'লগইন ব্যর্থ হয়েছে।', code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}
