import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';
import { resolveSupabaseIdentity } from '@/features/auth/server/identity-resolution';
import { normalizeEmail } from '@/features/auth/services/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(256).regex(/\d/, 'Password must include a number.'),
});

const GENERIC_FAILURE = {
  error: "Couldn't complete your account. Please try again.",
  code: 'REGISTRATION_FAILED',
};

/**
 * Finishes registration after the OTP step.
 *
 * The request must carry the Supabase session that was minted by the verified
 * OTP, so the caller has already proven control of the address. This route only
 * sets the password and delegates profile resolution to the shared identity
 * layer, which makes the operation idempotent: a double click or a replayed
 * request resolves to the same single LofiMart user.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization') || '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!bearer) return NextResponse.json({ error: 'Verification session is required.', code: 'UNAUTHORIZED' }, { status: 401 });

    const body = Schema.parse(await request.json());
    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: 'Please enter a valid email address.', code: 'INVALID_EMAIL' }, { status: 400 });
    }

    const supabase = createSupabaseServerClient(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !authData.user || normalizeEmail(authData.user.email || '') !== email) {
      return NextResponse.json({ error: 'Your verification session has expired. Please start again.', code: 'INVALID_SESSION' }, { status: 401 });
    }

    const service = createSupabaseServerClient(true);
    const { error: updateError } = await service.auth.admin.updateUserById(authData.user.id, {
      password: body.password,
      email_confirm: true,
      user_metadata: { ...authData.user.user_metadata, name: body.name, role: 'customer' },
    });
    if (updateError) {
      console.error('[auth:complete-registration] password update failed', updateError.message);
      return NextResponse.json({ error: "Couldn't complete your account. Please try again.", code: 'PASSWORD_SYNC_FAILED' }, { status: 502 });
    }

    const resolution = await resolveSupabaseIdentity({
      supabaseUserId: authData.user.id,
      email,
      emailVerified: true,
      assumeVerifiedEmail: true,
      displayName: body.name,
      requestedRole: 'customer',
      allowCreate: true,
    });

    if (resolution.status === 'link_conflict') {
      return NextResponse.json({ error: 'Account already exists. Please login.', code: 'ACCOUNT_EXISTS' }, { status: 409 });
    }

    if (resolution.status !== 'resolved') {
      return NextResponse.json(GENERIC_FAILURE, { status: 500 });
    }

    const user = resolution.user;

    return NextResponse.json(
      {
        success: true,
        // Only a genuinely new profile reaches the new-account success screen.
        isNewUser: resolution.createdProfile,
        user: {
          ...user,
          avatar_url: user.avatarUrl,
          seller_status: user.sellerStatus,
        },
        supabaseUserId: authData.user.id,
      },
      { status: resolution.createdProfile ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Please check your details and try again.' }, { status: 400 });
    }

    console.error('[auth:complete-registration] unexpected failure', error);
    return NextResponse.json(GENERIC_FAILURE, { status: 500 });
  }
}
