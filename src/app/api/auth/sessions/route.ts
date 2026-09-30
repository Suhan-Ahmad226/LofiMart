import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { createClient } from '@/lib/server';
import { requireApiUser } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json([], { status: 200 });
    }

    const currentSession = data.user;

    const [serverSessions] = await Promise.all([
      prisma.loginActivity
        .findMany({
          where: { userId: String(user.id) },
          orderBy: { loggedInAt: 'desc' },
        })
        .catch(() => []),
    ]);

    return NextResponse.json(
      serverSessions.map((session: any) => ({
        session_id: session.id,
        created_at: session.loggedInAt?.toISOString() ?? null,
        expires_at: null,
        device_name: session.deviceName ?? null,
        ip_address: session.ipAddress ?? null,
        user_agent: session.userAgent ?? null,
        location: session.location ?? null,
        is_current: false,
      })),
    );
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
