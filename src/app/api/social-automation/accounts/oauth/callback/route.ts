import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv } from '@/lib/env';
import { requireApiUser, requireSellerRole } from '../../../../_compat/shared';
import {
  exchangeFacebookCode,
  exchangeLongLivedFacebookToken,
  fetchFacebookPages,
  requireFacebookConfig,
} from '@/features/social-automation/services/facebook.service';
import {
  getPendingOAuthState,
  invalidateOAuthState,
  storePendingOAuthPages,
} from '@/features/social-automation/services/oauth.service';
import { encryptSensitiveValue } from '@/features/shared/services/security/fieldEncryption';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oauthRedirect(env: { FRONTEND_URL: string }, query: Record<string, string>) {
  const url = new URL('/social-automation', env.FRONTEND_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);
  const env = getServerEnv();
  const searchParams = new URL(request.url).searchParams;
  const facebookError = searchParams.get('error');
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (facebookError) {
    return oauthRedirect(env, {
      oauth: 'error',
      message: facebookError === 'access_denied' ? 'facebook_authorization_cancelled' : 'facebook_authorization_failed',
    });
  }

  if (!code || !state) {
    return oauthRedirect(env, { oauth: 'error', message: 'invalid_or_expired_state' });
  }

  const oauthState = await getPendingOAuthState(sellerId, state);
  if (!oauthState) {
    return oauthRedirect(env, { oauth: 'error', message: 'invalid_or_expired_state' });
  }

  try {
    const config = requireFacebookConfig();
    const tokenResult = await exchangeFacebookCode(config, code);
    const longLivedResult = await exchangeLongLivedFacebookToken(config, tokenResult.accessToken);
    const pages = await fetchFacebookPages(config, longLivedResult.accessToken);

    if (pages.length === 0) {
      await invalidateOAuthState(oauthState.id);
      return oauthRedirect(env, { oauth: 'error', message: 'no_facebook_pages_found' });
    }

    const encryptedUserToken = encryptSensitiveValue(longLivedResult.accessToken);
    if (!encryptedUserToken) throw new Error('Facebook OAuth session could not be stored securely.');

    const userTokenExpiresAt =
      typeof longLivedResult.expiresIn === 'number' && longLivedResult.expiresIn > 0
        ? new Date(Date.now() + longLivedResult.expiresIn * 1000)
        : undefined;

    await storePendingOAuthPages(oauthState.id, encryptedUserToken, pages, userTokenExpiresAt);

    return oauthRedirect(env, {
      oauth: 'select_page',
      state: oauthState.state,
    });
  } catch (error) {
    await invalidateOAuthState(oauthState.id).catch(() => undefined);

    console.error('[facebook-oauth] callback failed', {
      sellerId,
      oauthStateId: oauthState.id,
      error: error instanceof Error ? error.message : String(error),
    });

    return oauthRedirect(env, { oauth: 'error', message: 'facebook_oauth_failed' });
  }
}
