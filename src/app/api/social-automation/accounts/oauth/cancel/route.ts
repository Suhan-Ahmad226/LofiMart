import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, requireSellerRole } from '../../../../_compat/shared';
import { cancelPendingOAuthState } from '@/features/social-automation/services/oauth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const body = (await request.json().catch(() => null)) as { state?: unknown } | null;
  if (typeof body?.state !== 'string' || !body.state) {
    return NextResponse.json({ error: 'OAuth state is missing.' }, { status: 400 });
  }

  const result = await cancelPendingOAuthState(body.state, String(user.id));
  if (result.count === 0) {
    return NextResponse.json({ error: 'OAuth state is invalid or expired.' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
