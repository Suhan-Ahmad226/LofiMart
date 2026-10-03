import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server';
import { getClientIp } from '@/app/api/auth/_utils/ip';
import { takeRateLimit } from '@/features/auth/services/rateLimit';
import { classifyLoginIdentifier } from '@/features/auth/services/identity';
import { resolveSupabaseIdentity } from '@/features/auth/server/identity-resolution';
import { formatAuthUser } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LoginSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
  redirectTarget: z.string().optional(),
});

/**
 * One message for every credential failure. Telling "no such account" apart
 * from "wrong password" would let anyone enumerate registered addresses.
 */
const GENERIC_CREDENTIALS_ERROR = 'Incorrect email or password. Please try again.';

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
        { error: 'Too many attempts. Please try again in a few minutes.', code: 'RATE_LIMITED' },
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
            error: 'Please verify your email first, then sign in again.',
            code: 'EMAIL_NOT_VERIFIED',
            identifier: email,
          },
          { status: 403 },
        );
      }

      if (message.includes('invalid login credentials')) {
        return NextResponse.json({ error: GENERIC_CREDENTIALS_ERROR, code: 'INVALID_CREDENTIALS' }, { status: 401 });
      }

      return NextResponse.json(
        { error: "Couldn't complete authentication. Please try again.", code: 'LOGIN_FAILED' },
        { status: 400 },
      );
    }

    const supabaseUser = data.user;
    if (!supabaseUser?.email || !data.session?.access_token || !data.session.refresh_token) {
      return NextResponse.json(
        { error: "Couldn't complete authentication. Please try again.", code: 'LOGIN_FAILED' },
        { status: 400 },
      );
    }

    const verifiedAt = supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null;

    // Supabase Auth is the identity authority. The application profile is
    // resolved - and created when it is genuinely missing - by the shared
    // identity layer, so password login and social login cannot diverge.
    const resolution = await resolveSupabaseIdentity({
      supabaseUserId: supabaseUser.id,
      email: supabaseUser.email,
      emailVerified: Boolean(verifiedAt),
      emailVerifiedAt: verifiedAt,
      allowCreate: true,
    });

    if (resolution.status !== 'resolved') {
      if (resolution.status === 'link_conflict') {
        return NextResponse.json(
          { error: 'Please sign in with the method you used before.', code: 'LINK_CONFLICT' },
          { status: 409 },
        );
      }

      return NextResponse.json({ error: GENERIC_CREDENTIALS_ERROR, code: 'INVALID_CREDENTIALS' }, { status: 401 });
    }

    const user = resolution.user;

    if (user.isBlocked || user.deactivatedAt) {
      return NextResponse.json({ error: 'This account is not active.' }, { status: 403 });
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
        { error: 'Please check the details and try again.', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    console.error('[auth:login] unexpected failure', error);
    return NextResponse.json(
      { error: "Couldn't complete authentication. Please try again.", code: 'UNKNOWN_ERROR' },
      { status: 500 },
    );
  }
}