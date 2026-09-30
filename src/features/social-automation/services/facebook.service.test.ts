import { createHmac } from 'crypto';
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildFacebookOAuthUrl,
  classifyFacebookCode,
  describeFacebookError,
  exchangeFacebookCode,
  FacebookApiException,
  getAppSecretProof,
  getFacebookErrorMessage,
  getFacebookConfig,
  getPublicProductImageUrl,
} from './facebook.service';

vi.mock('@/lib/env', () => ({
  getServerEnv: vi.fn(() => ({ FRONTEND_URL: 'https://shop.test' })),
}));

describe('getFacebookConfig', () => {
  const saved = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...saved };
    for (const key of [
      'FACEBOOK_APP_ID',
      'FACEBOOK_APP_SECRET',
      'FACEBOOK_CLIENT_ID',
      'FACEBOOK_CLIENT_SECRET',
      'FACEBOOK_REDIRECT_URI',
    ]) {
      delete process.env[key];
    }
  });

  it('returns null when no Facebook variables are set', () => {
    expect(getFacebookConfig()).toBeNull();
  });

  it('supports the canonical FACEBOOK_APP_ID / FACEBOOK_APP_SECRET pair', () => {
    process.env['FACEBOOK_APP_ID'] = 'app-id';
    process.env['FACEBOOK_APP_SECRET'] = 'app-secret';

    const config = getFacebookConfig();
    expect(config).toEqual({
      appId: 'app-id',
      appSecret: 'app-secret',
      redirectUri: 'https://shop.test/api/social-automation/accounts/oauth/callback',
    });
  });

  it('supports the legacy FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET pair', () => {
    process.env['FACEBOOK_CLIENT_ID'] = 'client-id';
    process.env['FACEBOOK_CLIENT_SECRET'] = 'client-secret';

    const config = getFacebookConfig();
    expect(config?.appId).toBe('client-id');
    expect(config?.appSecret).toBe('client-secret');
  });

  it('honors an explicit FACEBOOK_REDIRECT_URI override', () => {
    process.env['FACEBOOK_APP_ID'] = 'app-id';
    process.env['FACEBOOK_APP_SECRET'] = 'app-secret';
    process.env['FACEBOOK_REDIRECT_URI'] = 'https://shop.test/custom/callback';

    const config = getFacebookConfig();
    expect(config?.redirectUri).toBe('https://shop.test/custom/callback');
  });
});

describe('buildFacebookOAuthUrl', () => {
  it('builds a dialog URL with the required query parameters', () => {
    const url = new URL(
      buildFacebookOAuthUrl(
        { appId: 'app-id', appSecret: 'secret', redirectUri: 'https://shop.test/cb' },
        'state-hex',
      ),
    );

    expect(url.origin).toBe('https://www.facebook.com');
    expect(url.pathname).toContain('/dialog/oauth');
    expect(url.searchParams.get('client_id')).toBe('app-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://shop.test/cb');
    expect(url.searchParams.get('state')).toBe('state-hex');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')?.split(',')).toEqual([
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_show_list',
    ]);
  });
});

describe('getAppSecretProof', () => {
  it('computes an HMAC-SHA256 of the access token with the app secret', () => {
    const expected = createHmac('sha256', 'app-secret').update('access-token').digest('hex');
    expect(getAppSecretProof('access-token', 'app-secret')).toBe(expected);
  });
});

describe('getPublicProductImageUrl', () => {
  it('returns null for empty or missing images', () => {
    expect(getPublicProductImageUrl(null)).toBeNull();
    expect(getPublicProductImageUrl(undefined)).toBeNull();
    expect(getPublicProductImageUrl('')).toBeNull();
  });

  it('returns null for non-https or invalid URLs', () => {
    expect(getPublicProductImageUrl('http://images.test/a.jpg')).toBeNull();
    expect(getPublicProductImageUrl('not a url')).toBeNull();
  });

  it('keeps plain https URLs unchanged', () => {
    expect(getPublicProductImageUrl('https://images.test/a.jpg')).toBe('https://images.test/a.jpg');
  });

  it('adds transformation parameters to Cloudinary URLs', () => {
    const input = 'https://res.cloudinary.com/demo/image/upload/v1234/a.jpg';
    expect(getPublicProductImageUrl(input)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto:good,c_limit,w_1200/v1234/a.jpg',
    );
  });
});

describe('classifyFacebookCode', () => {
  it('classifies token errors', () => {
    expect(classifyFacebookCode(190, 0)).toBe('token');
    expect(classifyFacebookCode(0, 459)).toBe('token');
    expect(classifyFacebookCode(10, 463)).toBe('token');
  });

  it('classifies permission errors', () => {
    expect(classifyFacebookCode(100, 0)).toBe('permission');
    expect(classifyFacebookCode(200, 0)).toBe('permission');
    expect(classifyFacebookCode(452, 0)).toBe('permission');
  });

  it('classifies media errors', () => {
    expect(classifyFacebookCode(4, 0)).toBe('media');
    expect(classifyFacebookCode(324, 0)).toBe('media');
  });

  it('falls back to other', () => {
    expect(classifyFacebookCode(1, 1)).toBe('other');
  });
});

describe('getFacebookErrorMessage', () => {
  it('maps token errors to a reconnect message', () => {
    expect(getFacebookErrorMessage({ error: { code: 190 } })).toContain('expired');
    expect(getFacebookErrorMessage({ error: { errorSubcode: 459 } })).toContain('expired');
  });

  it('maps permission errors to a permission message', () => {
    expect(getFacebookErrorMessage({ error: { code: 100 } })).toContain('permission');
  });

  it('maps media errors to a media message', () => {
    expect(getFacebookErrorMessage({ error: { code: 4 } })).toContain('media');
  });

  it('returns a generic message otherwise', () => {
    expect(getFacebookErrorMessage({ error: { code: 2 } })).toBe('Facebook publishing failed. Please try again.');
  });
});

describe('describeFacebookError', () => {
  it('preserves FacebookApiException kind and message', () => {
    const error = new FacebookApiException('token', 'Session went away.', 190, 0);
    expect(describeFacebookError(error)).toEqual({ kind: 'token', message: 'Session went away.' });
  });

  it('infers token kind from plain messages', () => {
    expect(describeFacebookError(new Error('The access token has expired.'))).toMatchObject({ kind: 'token' });
  });

  it('infers permission kind from plain messages', () => {
    expect(describeFacebookError(new Error('Permission denied for this Page.'))).toMatchObject({ kind: 'permission' });
  });

  it('falls back to other for unknown messages', () => {
    expect(describeFacebookError(new Error('Something else went wrong.'))).toMatchObject({ kind: 'other' });
  });
});

describe('exchangeFacebookCode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exchanges an authorization code for a short-lived token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ access_token: 'short-token', expires_in: 5184000 }),
      })),
    );

    const result = await exchangeFacebookCode(
      { appId: 'app-id', appSecret: 'app-secret', redirectUri: 'https://shop.test/cb' },
      'auth-code',
    );
    expect(result).toEqual({ accessToken: 'short-token', expiresIn: 5184000 });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = new URLSearchParams(init.body);
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('client_id')).toBe('app-id');
    expect(body.get('client_secret')).toBe('app-secret');
  });

  it('throws a typed FacebookApiException on Graph errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { code: 190, message: 'Invalid OAuth access token.' } }),
      })),
    );

    await expect(
      exchangeFacebookCode({ appId: 'app-id', appSecret: 'app-secret', redirectUri: 'https://shop.test/cb' }, 'bad'),
    ).rejects.toMatchObject({ name: 'FacebookApiException', kind: 'token' });
  });
});