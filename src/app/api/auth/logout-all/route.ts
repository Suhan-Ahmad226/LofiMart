import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { createClient } from '@/lib/server';
import { requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // ignore sign-out errors from Supabase
  }

  await prisma.loginActivity.updateMany({
    where: { userId: String(user.id), revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
