import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  attachAppSessionCookies,
  createLocalUserFromSupabase,
  createSupabaseServerClient,
  formatAuthUser,
  issueAppSession,
  normalizeAuthRole,
} from '../shared';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';

const ExchangeSchema = z.object({
  accessToken: z.string().min(1),
  role: z.string().optional(),
  name: z.string().optional(),
  referralCode: z.string().optional(),
  mode: z.enum(['login', 'register']).optional(),
});

export async function POST(req: Request) {
  try {
    const body = ExchangeSchema.parse(await req.json());
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(body.accessToken);

    if (error || !data.user?.email) {
      return NextResponse.json({ error: 'Supabase session not found' }, { status: 401 });
    }

    const supabaseUser = data.user;
    const email = supabaseUser.email;

    if (!email) {
      return NextResponse.json({ error: 'Supabase session email is missing' }, { status: 401 });
    }

    const verifiedAt = supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null;
    const displayName =
      body.name ||
      (typeof supabaseUser.user_metadata?.name === 'string' ? supabaseUser.user_metadata.name : undefined) ||
      (typeof supabaseUser.user_metadata?.full_name === 'string' ? supabaseUser.user_metadata.full_name : undefined);

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      if (body.mode !== 'register' && body.role) {
        return NextResponse.json({ error: 'Account not found. Please register first.' }, { status: 404 });
      }

      user = await createLocalUserFromSupabase({
        email,
        name: displayName,
        role: normalizeAuthRole(body.role),
        emailVerified: Boolean(verifiedAt),
        emailVerifiedAt: verifiedAt,
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: user.name || displayName || undefined,
          emailVerified: user.emailVerified || Boolean(verifiedAt),
          emailVerifiedAt: user.emailVerifiedAt || verifiedAt,
        },
      });
    }

    if (user.isBlocked || user.deactivatedAt) {
      return NextResponse.json({ error: 'This account is not active.' }, { status: 403 });
    }

    const session = await issueAppSession(user);
    const response = NextResponse.json({
      user: formatAuthUser(user),
      token: session.accessToken,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
    });

    return attachAppSessionCookies(response, user, session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid auth exchange payload', details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to complete sign in' },
      { status: 500 },
    );
  }
}
