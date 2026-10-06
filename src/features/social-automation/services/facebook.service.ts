import { createHmac, randomBytes } from 'crypto';
import { getServerEnv } from '@/lib/env';

export const FACEBOOK_GRAPH_VERSION = 'v24.0';

type FacebookConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

type GraphErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    errorSubcode?: number;
    fbtraceId?: string;
  };
};

export type FacebookErrorKind = 'token' | 'permission' | 'media' | 'other';

export class FacebookApiException extends Error {
  readonly kind: FacebookErrorKind;
  readonly code: number;
  readonly subcode: number;

  constructor(kind: FacebookErrorKind, message: string, code = 0, subcode = 0) {
    super(message);
    this.name = 'FacebookApiException';
    this.kind = kind;
    this.code = code;
    this.subcode = subcode;
  }
}

export type FacebookPage = {
  id: string;
  name: string;
  accessToken: string;
};

export type FacebookPublishResult = {
  externalPostId: string;
};

function getTrimmedEnv(name: string) {
  const value = process.env[name];
  return value?.trim() || undefined;
}

export function getFacebookConfig(): FacebookConfig | null {
  const env = getServerEnv();
  const appId = getTrimmedEnv('FACEBOOK_APP_ID') || getTrimmedEnv('FACEBOOK_CLIENT_ID');
  const appSecret = getTrimmedEnv('FACEBOOK_APP_SECRET') || getTrimmedEnv('FACEBOOK_CLIENT_SECRET');
  const redirectUri =
    getTrimmedEnv('FACEBOOK_REDIRECT_URI') ||
    `${env.FRONTEND_URL}/api/social-automation/accounts/oauth/callback`;

  if (!appId || !appSecret) return null;

  return { appId, appSecret, redirectUri };
}

export function requireFacebookConfig() {
  const config = getFacebookConfig();
  if (!config) {
    throw new Error('Facebook OAuth is not configured.');
  }
  return config;
}

export function generateOAuthState() {
  return randomBytes(32).toString('hex');
}

export function buildFacebookOAuthUrl(config: FacebookConfig, state: string) {
  const url = new URL(`https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', 'pages_manage_posts,pages_read_engagement,pages_show_list');
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

export function getAppSecretProof(accessToken: string, appSecret: string) {
  return createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

async function readGraphResponse(response: Response): Promise<Record<string, unknown> & GraphErrorPayload> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & GraphErrorPayload;
  if (!response.ok) {
    const code = Number(data?.error?.code ?? 0);
    const subcode = Number(data?.error?.errorSubcode ?? 0);
    throw new FacebookApiException(
      classifyFacebookCode(code, subcode),
      getFacebookErrorMessage(data),
      code,
      subcode,
    );
  }
  return data;
}

export function classifyFacebookCode(code: number, subcode: number): FacebookErrorKind {
  if (
    code === 190 ||
    subcode === 459 ||
    subcode === 463 ||
    subcode === 467 ||
    subcode === 468 ||
    (code === 10 && subcode === 463)
  ) {
    return 'token';
  }

  if (code === 100 || code === 200 || code === 298 || code === 452) {
    return 'permission';
  }

  if (code === 4 || code === 32 || code === 324) {
    return 'media';
  }

  return 'other';
}

export async function exchangeFacebookCode(
  config: FacebookConfig,
  code: string,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const response = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.redirectUri,
      code,
    }),
  });

  const data = await readGraphResponse(response);
  const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
  if (!accessToken) throw new Error('Facebook did not return an access token.');

  return {
    accessToken,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
  };
}

export async function exchangeLongLivedFacebookToken(
  config: FacebookConfig,
  accessToken: string,
): Promise<{ accessToken: string; expiresIn?: number }> {
  const response = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: accessToken,
    }),
  });

  const data = await readGraphResponse(response);
  const longLivedToken = typeof data.access_token === 'string' ? data.access_token : '';
  if (!longLivedToken) throw new Error('Facebook did not return a long-lived access token.');

  return {
    accessToken: longLivedToken,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
  };
}

export async function fetchFacebookPages(
  config: FacebookConfig,
  userAccessToken: string,
): Promise<FacebookPage[]> {
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/accounts`);
  url.searchParams.set('fields', 'id,name,access_token,tasks');
  url.searchParams.set('appsecret_proof', getAppSecretProof(userAccessToken, config.appSecret));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${userAccessToken}`,
    },
  });

  const data = await readGraphResponse(response);
  if (!Array.isArray(data.data)) return [];

  return data.data
    .filter((page): page is Record<string, unknown> => Boolean(page && typeof page === 'object'))
    .map((page) => ({
      id: typeof page.id === 'string' ? page.id : '',
      name: typeof page.name === 'string' ? page.name : '',
      accessToken: typeof page.access_token === 'string' ? page.access_token : '',
    }))
    .filter((page) => Boolean(page.id && page.name && page.accessToken));
}

export async function validateFacebookPageToken(
  config: FacebookConfig,
  pageId: string,
  pageAccessToken: string,
) {
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(pageId)}`);
  url.searchParams.set('fields', 'id,name');
  url.searchParams.set('appsecret_proof', getAppSecretProof(pageAccessToken, config.appSecret));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${pageAccessToken}`,
    },
  });

  const data = await readGraphResponse(response);
  if (data.id !== pageId) throw new Error('Facebook Page access token does not match the selected Page.');
  return { id: String(data.id), name: typeof data.name === 'string' ? data.name : undefined };
}

export async function publishFacebookPagePost(
  config: FacebookConfig,
  pageId: string,
  pageAccessToken: string,
  input: {
    caption: string;
    imageUrl: string | null;
    productUrl: string;
  },
): Promise<FacebookPublishResult> {
  const endpoint = input.imageUrl ? 'photos' : 'feed';
  const url = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/${encodeURIComponent(pageId)}/${endpoint}`);
  const body: Record<string, string | boolean> = {
    appsecret_proof: getAppSecretProof(pageAccessToken, config.appSecret),
  };

  if (input.imageUrl) {
    body.url = input.imageUrl;
    body.caption = input.caption;
    body.published = true;
  } else {
    body.message = input.caption;
    body.link = input.productUrl;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pageAccessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await readGraphResponse(response);
  const externalPostId =
    typeof data.post_id === 'string'
      ? data.post_id
      : typeof data.id === 'string'
        ? data.id
        : '';

  if (!externalPostId) throw new Error('Facebook did not return a post identifier.');
  return { externalPostId };
}

export function getFacebookErrorMessage(payload: GraphErrorPayload | unknown) {
  const data = payload as GraphErrorPayload | null;
  const code = Number(data?.error?.code ?? 0);
  const subcode = Number(data?.error?.errorSubcode ?? 0);

  if (
    code === 190 ||
    subcode === 459 ||
    subcode === 463 ||
    subcode === 467 ||
    subcode === 468
  ) {
    return 'Facebook Page access expired or was revoked. Reconnect Facebook.';
  }

  if (code === 100 || code === 200 || code === 298 || code === 452) {
    return 'Facebook Page permission is missing or denied. Reconnect Facebook.';
  }

  if (code === 4 || code === 32 || code === 324) {
    return 'Facebook could not publish the product media. Try another product image.';
  }

  return 'Facebook publishing failed. Please try again.';
}

export function describeFacebookError(error: unknown): { kind: FacebookErrorKind; message: string } {
  if (error instanceof FacebookApiException) {
    return { kind: error.kind, message: error.message };
  }

  const message = error instanceof Error ? error.message : 'Facebook publishing failed. Please try again.';
  const kind: FacebookErrorKind = dropMatching(message, [
    'expired',
    'revoked',
    'access token',
    'access_token',
    'oAuthException',
    'session has expired',
  ])
    ? 'token'
    : dropMatching(message, ['permission', 'authorization', 'denied'])
      ? 'permission'
      : 'other';

  return { kind, message };
}

function dropMatching(value: string, needles: string[]) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

export function getPublicProductImageUrl(imageUrl: string | null | undefined) {
  if (!imageUrl) return null;
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== 'https:') return null;
    if (/^https:\/\/res\.cloudinary\.com\//i.test(url.toString())) {
      return url.toString().replace('/image/upload/', '/image/upload/f_jpg,q_auto:good,c_limit,w_1200/');
    }
    return url.toString();
  } catch {
    return null;
  }
}
