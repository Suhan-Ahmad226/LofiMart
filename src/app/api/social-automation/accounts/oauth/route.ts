import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';
import {
  buildFacebookOAuthUrl,
  generateOAuthState,
  requireFacebookConfig,
} from '@/features/social-automation/services/facebook.service';
import { createOAuthState } from '@/features/social-automation/services/oauth.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  try {
    const config = requireFacebookConfig();
    const state = generateOAuthState();
    const oauthState = await createOAuthState(String(user.id));
    const authUrl = buildFacebookOAuthUrl(config, oauthState.state);

    return NextResponse.json({ authUrl, state: oauthState.state });
  } catch {
    return NextResponse.json(
      { error: 'Facebook OAuth is not configured.' },
      { status: 503 },
    );
  }
}
