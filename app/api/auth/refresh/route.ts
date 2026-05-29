import { NextRequest, NextResponse } from 'next/server';
import { getAccessCookieOptions, getRefreshCookieOptions, rotateSession } from '@/src/services/auth/sessionStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const refreshToken = String(body?.refreshToken || request.cookies.get('refresh_token')?.value || '').trim();

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token is required' }, { status: 401 });
    }

    const rotated = await rotateSession(refreshToken);
    if (!rotated) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const response = NextResponse.json({
      token: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      user: rotated.session.user,
      expiresAt: rotated.expiresAt.toISOString(),
    });

    response.cookies.set('access_token', rotated.accessToken, getAccessCookieOptions(rotated.session.user));
    response.cookies.set('refresh_token', rotated.refreshToken, getRefreshCookieOptions(rotated.session.user));

    return response;
  } catch (error) {
    console.error('POST /api/auth/refresh error:', error);
    return NextResponse.json({ error: 'Failed to refresh session' }, { status: 500 });
  }
}
