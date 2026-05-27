import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  attachAppSessionCookies,
  createLocalUserFromSupabase,
  createSupabaseServerClient,
  formatAuthUser,
  isAuthRole,
  issueAppSession,
} from '../shared';
import { prisma } from '@/lib/server';

export const runtime = 'nodejs';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.string(),
  name: z.string().trim().min(1).max(120),
  referralCode: z.string().optional(),
  redirectTo: z.string().url().optional(),
});

export async function POST(req: Request) {
  try {
    const body = RegisterSchema.parse(await req.json());

    if (!isAuthRole(body.role)) {
      return NextResponse.json({ error: 'Invalid account role.' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabase = createSupabaseServerClient(hasServiceRole);
    const authResult = hasServiceRole
      ? await supabase.auth.admin.createUser({
          email: body.email,
          password: body.password,
          email_confirm: false,
          user_metadata: {
            name: body.name,
            role: body.role,
          },
        })
      : await supabase.auth.signUp({
          email: body.email,
          password: body.password,
          options: {
            emailRedirectTo: body.redirectTo,
            data: {
              name: body.name,
              role: body.role,
            },
          },
        });

    if (authResult.error) {
      return NextResponse.json({ error: authResult.error.message || 'Registration failed' }, { status: 400 });
    }

    const authUser = authResult.data.user;
    const verifiedAt = authUser?.email_confirmed_at ? new Date(authUser.email_confirmed_at) : null;
    const user = await createLocalUserFromSupabase({
      email: body.email,
      name: body.name,
      role: body.role,
      password: body.password,
      emailVerified: Boolean(verifiedAt),
      emailVerifiedAt: verifiedAt,
    });

    const hasSupabaseSession =
      'session' in authResult.data &&
      Boolean(
        authResult.data.session &&
          typeof authResult.data.session === 'object' &&
          'access_token' in authResult.data.session,
      );

    if (hasSupabaseSession) {
      const session = await issueAppSession(user);

      const response = NextResponse.json({
        user: formatAuthUser(user),
        token: session.accessToken,
        refreshToken: session.refreshToken,
        refreshExpiresAt: session.expiresAt,
      });

      return attachAppSessionCookies(response, user, session);
    }

    return NextResponse.json({
      user: formatAuthUser(user),
      requiresVerification: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid registration payload', details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 500 },
    );
  }
}
