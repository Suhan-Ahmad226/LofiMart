import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server';
import { requireApiUser } from '../../_compat/shared';
import { syncSupabasePassword } from '@/features/auth/services/password-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validatePassword(password: string): boolean {
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

async function markLoginActivitiesRevoked(userId: string, currentSessionId?: string) {
  await prisma.loginActivity.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(currentSessionId ? { sessionId: { not: currentSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const body = await request.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current and new passwords are required' }, { status: 400 });
  }

  if (!validatePassword(newPassword)) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters with letters and numbers' },
      { status: 400 },
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: String(user.id) },
    select: { id: true, supabaseAuthId: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (!dbUser.supabaseAuthId) {
    return NextResponse.json(
      {
        error:
          'এই অ্যাকাউন্টে এখনো কোনো পাসওয়ার্ড নেই। "আমার পাসওয়ার্ড ভুলে গেছি" দিয়ে একটি পাসওয়ার্ড সেট করুন।',
      },
      { status: 400 },
    );
  }

  if (dbUser.supabaseAuthId) {
    const sync = await syncSupabasePassword({
      supabaseAuthId: dbUser.supabaseAuthId,
      newPassword,
    });

    if (!sync.ok) {
      return NextResponse.json(
        {
          error:
            'Your password could not be updated right now. Please try again. If the problem continues, use "Forgot password" to reset it.',
          code: 'PASSWORD_SYNC_FAILED',
        },
        { status: 502 },
      );
    }
  }

  await markLoginActivitiesRevoked(String(user.id));

  return NextResponse.json({ success: true });
}
