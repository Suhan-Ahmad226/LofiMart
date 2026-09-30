import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, requireSellerRole } from '../../../../_compat/shared';
import { getPendingOAuthState, getPendingPages } from '@/features/social-automation/services/oauth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const state = new URL(request.url).searchParams.get('state');
  if (!state) {
    return NextResponse.json({ error: 'OAuth state is missing.' }, { status: 400 });
  }

  const oauthState = await getPendingOAuthState(String(user.id), state);
  if (!oauthState) {
    return NextResponse.json({ error: 'OAuth state is invalid or expired.' }, { status: 400 });
  }

  return NextResponse.json({ pages: getPendingPages(oauthState) });
}
