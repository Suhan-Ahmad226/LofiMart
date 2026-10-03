import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createSupabaseServer } from '@/lib/server';
import { resolveSupabaseIdentity } from '@/features/auth/server/identity-resolution';
import {
  extractProviderIdentity,
  extractSupabaseAvatarUrl,
  formatAuthUser,
} from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ExchangeSchema = z.object({
  accessToken: z.string().min(1),
  name: z.string().optional(),
  referralCode: z.string().optional(),
  mode: z.enum(['login', 'register']).optional(),
  /**
   * Kept for wire compatibility with the standalone register page, but the
   * value is only ever treated as self-service intent and is sanitised
   * server-side. It can never grant a privileged role.
   */
  role: z.string().optional(),
});

const GENERIC_FAILURE = {
  error: "Couldn't complete authentication. Please try again.",
  code: 'AUTH_FAILED',
};

/**
 * Turns one resolver outcome into the HTTP response the callback page expects.
 * Every branch returns a safe, actionable message: no database, Supabase or
 * provider internals are ever forwarded to the browser.
 */
export async function POST(req: Request) {
  try {
    const body = ExchangeSchema.parse(await req.json());
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.getUser(body.accessToken);

    if (error || !data.user) {
      return NextResponse.json(GENERIC_FAILURE, { status: 401 });
    }

    const supabaseUser = data.user;
    const verifiedAt = supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null;
    const emailVerified = Boolean(verifiedAt);
    const metadata = supabaseUser.user_metadata ?? {};

    const displayName =
      body.name ||
      (typeof metadata.name === 'string' ? metadata.name : undefined) ||
      (typeof metadata.full_name === 'string' ? metadata.full_name : undefined);

    const resolution = await resolveSupabaseIdentity({
      supabaseUserId: supabaseUser.id,
      email: supabaseUser.email,
      emailVerified,
      emailVerifiedAt: verifiedAt,
      provider: extractProviderIdentity(supabaseUser),
      providerEmailVerified: emailVerified,
      displayName,
      avatarUrl: extractSupabaseAvatarUrl(supabaseUser),
      requestedRole: body.role,
      // A social sign-in on a brand-new identity is a registration. The modal
      // always asks for "register" so a first-time Google/Facebook user can be
      // created; existing users resolve to their profile either way.
      allowCreate: true,
    });

    if (resolution.status === 'invalid_email') {
      return NextResponse.json(GENERIC_FAILURE, { status: 401 });
    }

    if (resolution.status === 'provider_email_unverified') {
      return NextResponse.json(
        {
          success: false,
          code: 'PROVIDER_EMAIL_UNVERIFIED',
          error: "This provider hasn't verified your email yet. Please sign in with your email and password instead.",
        },
        { status: 409 },
      );
    }

    if (resolution.status === 'email_unverified') {
      return NextResponse.json(
        {
          success: false,
          code: 'EMAIL_UNVERIFIED',
          error: "Please verify your email before continuing. We'll send you a verification code.",
          identifier: resolution.identifier,
          purpose: 'verify_email',
          phone: resolution.phone,
        },
        { status: 409 },
      );
    }

    if (resolution.status === 'link_conflict') {
      return NextResponse.json(
        {
          success: false,
          code: 'PROVIDER_LINK_CONFLICT',
          error:
            'This account is already linked to another LofiMart account. Sign in with the method you used before to continue.',
        },
        { status: 409 },
      );
    }

    if (resolution.status === 'not_found') {
      return NextResponse.json(
        { success: false, code: 'ACCOUNT_NOT_FOUND', error: 'Account not found. Please register first.' },
        { status: 404 },
      );
    }

    const user = resolution.user;

    if (user.isBlocked || user.deactivatedAt) {
      return NextResponse.json({ error: 'This account is not active.' }, { status: 403 });
    }

    return NextResponse.json({
      isNewUser: resolution.createdProfile,
      linkedProvider: resolution.linkedProvider,
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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ...GENERIC_FAILURE, code: 'INVALID_REQUEST' }, { status: 400 });
    }

    console.error('[auth:exchange] unexpected failure', error);
    return NextResponse.json(GENERIC_FAILURE, { status: 500 });
  }
}