import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';
import { prisma } from '@/lib/server';
import { normalizeEmail } from '@/features/auth/services/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(256),
});

export async function POST(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization') || '';
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    if (!bearer) return NextResponse.json({ error: 'Verification session is required.', code: 'UNAUTHORIZED' }, { status: 401 });

    const body = Schema.parse(await request.json());
    const email = normalizeEmail(body.email);
    const supabase = createSupabaseServerClient(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    if (authError || !authData.user || normalizeEmail(authData.user.email || '') !== email) {
      return NextResponse.json({ error: 'Verification session is invalid or expired.', code: 'INVALID_SESSION' }, { status: 401 });
    }

    const service = createSupabaseServerClient(true);
    const { data: updated, error: updateError } = await service.auth.admin.updateUserById(authData.user.id, {
      password: body.password,
      email_confirm: true,
      user_metadata: { ...authData.user.user_metadata, name: body.name, role: 'customer' },
    });
    if (updateError) {
      return NextResponse.json({ error: 'Unable to finish account setup.', code: 'PASSWORD_SYNC_FAILED' }, { status: 502 });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, supabaseAuthId: true, emailVerified: true },
    });

    let user;
    if (existing) {
      // A prior unverified registration may have already created the local
      // profile. Only the same Supabase identity may resume that account.
      if (existing.supabaseAuthId && existing.supabaseAuthId !== authData.user.id) {
        return NextResponse.json({ error: 'Account already exists. Please login.', code: 'ACCOUNT_EXISTS' }, { status: 409 });
      }

      user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          supabaseAuthId: authData.user.id,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          sellerStatus: 'approved',
        },
        select: {
          id: true, name: true, email: true, phone: true, role: true, avatarUrl: true, sellerStatus: true, points: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          name: body.name,
          role: 'customer',
          supabaseAuthId: authData.user.id,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          sellerStatus: 'approved',
        },
        select: {
          id: true, name: true, email: true, phone: true, role: true, avatarUrl: true, sellerStatus: true, points: true,
        },
      });
    }

    return NextResponse.json({ success: true, user: { ...user, avatar_url: user.avatarUrl, seller_status: user.sellerStatus }, supabaseUserId: updated.user?.id ?? authData.user.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid registration data.' }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Registration failed.' }, { status: 500 });
  }
}
