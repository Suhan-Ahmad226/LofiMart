import { logger } from '../../../../../lib/logger';
import { getServerEnv } from '../../../../../lib/env';
import {
  BKASH_CREATE_PAYMENT_PATH,
  BKASH_EXECUTE_PAYMENT_PATH,
  BKASH_QUERY_PAYMENT_PATH,
  BKASH_TOKEN_GRANT_PATH,
  BKASH_TOKEN_REFRESH_PATH,
} from './constants';
import { readBkashTokenCache, writeBkashTokenCache } from './token-store';
import type {
  BkashCreatePaymentRequest,
  BkashCreatePaymentResponse,
  BkashExecutePaymentResponse,
  BkashGrantTokenResponse,
  BkashQueryPaymentResponse,
  BkashTokenCache,
} from './types';

type BkashErrorPayload = {
  statusCode?: string;
  statusMessage?: string;
  message?: string;
  [key: string]: unknown;
};

class BkashApiError extends Error {
  statusCode?: string;
  httpStatus?: number;
  payload?: unknown;

  constructor(message: string, options?: { statusCode?: string; httpStatus?: number; payload?: unknown }) {
    super(message);
    this.name = 'BkashApiError';
    this.statusCode = options?.statusCode;
    this.httpStatus = options?.httpStatus;
    this.payload = options?.payload;
  }
}

let tokenRefreshPromise: Promise<string> | null = null;

function getBkashConfig() {
  const env = getServerEnv();
  if (!env.BKASH_BASE_URL || !env.BKASH_USERNAME || !env.BKASH_PASSWORD || !env.BKASH_APP_KEY || !env.BKASH_APP_SECRET) {
    throw new BkashApiError('bKash is not configured. Set BKASH_BASE_URL, BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, and BKASH_APP_SECRET.');
  }

  return {
    baseUrl: env.BKASH_BASE_URL.replace(/\/+$/, ''),
    username: env.BKASH_USERNAME,
    password: env.BKASH_PASSWORD,
    appKey: env.BKASH_APP_KEY,
    appSecret: env.BKASH_APP_SECRET,
  };
}

function buildBkashHeaders(idToken?: string, idempotencyKey?: string) {
  const { appKey } = getBkashConfig();
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    username: getBkashConfig().username,
    password: getBkashConfig().password,
    app_key: appKey,
    ...(idToken ? { authorization: idToken, 'x-app-key': appKey } : {}),
    ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
  };
}

async function bkashFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const { baseUrl } = getBkashConfig();
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? 30_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });

    const rawText = await response.text();
    const payload = rawText ? (JSON.parse(rawText) as T | BkashErrorPayload) : ({} as T);

    if (!response.ok) {
      const errorPayload = payload as BkashErrorPayload;
      throw new BkashApiError(
        errorPayload.statusMessage || errorPayload.message || `bKash request failed with HTTP ${response.status}`,
        {
          statusCode: errorPayload.statusCode,
          httpStatus: response.status,
          payload,
        },
      );
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

function tokenResponseToCache(payload: BkashGrantTokenResponse): BkashTokenCache {
  const expiresInSeconds = Number(payload.expires_in || 3600);
  return {
    idToken: payload.id_token,
    refreshToken: payload.refresh_token,
    tokenType: payload.token_type || 'Bearer',
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

async function grantToken() {
  const { appSecret } = getBkashConfig();
  const payload = await bkashFetch<BkashGrantTokenResponse>(BKASH_TOKEN_GRANT_PATH, {
    method: 'POST',
    headers: buildBkashHeaders(),
    body: JSON.stringify({
      app_key: getBkashConfig().appKey,
      app_secret: appSecret,
    }),
  });

  const cacheEntry = tokenResponseToCache(payload);
  await writeBkashTokenCache(cacheEntry, Math.max(60, Math.floor((cacheEntry.expiresAt - Date.now()) / 1000)));
  logger.info('payments.bkash.token.granted');
  return cacheEntry.idToken;
}

async function refreshToken(refreshToken: string) {
  const { appSecret } = getBkashConfig();
  const payload = await bkashFetch<BkashGrantTokenResponse>(BKASH_TOKEN_REFRESH_PATH, {
    method: 'POST',
    headers: buildBkashHeaders(),
    body: JSON.stringify({
      app_key: getBkashConfig().appKey,
      app_secret: appSecret,
      refresh_token: refreshToken,
    }),
  });

  const cacheEntry = tokenResponseToCache(payload);
  await writeBkashTokenCache(cacheEntry, Math.max(60, Math.floor((cacheEntry.expiresAt - Date.now()) / 1000)));
  logger.info('payments.bkash.token.refreshed');
  return cacheEntry.idToken;
}

export async function getBkashIdToken() {
  const cached = await readBkashTokenCache();
  if (cached) {
    return cached.idToken;
  }

  if (!tokenRefreshPromise) {
    tokenRefreshPromise = (async () => {
      const stale = await readBkashTokenCache();
      if (stale?.refreshToken) {
        try {
          return await refreshToken(stale.refreshToken);
        } catch (error) {
          logger.warn('payments.bkash.token.refresh_failed', {
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      return grantToken();
    })().finally(() => {
      tokenRefreshPromise = null;
    });
  }

  return tokenRefreshPromise;
}

function isAuthError(error: unknown) {
  return error instanceof BkashApiError && (error.httpStatus === 401 || error.httpStatus === 403);
}

async function withAuthorizedBkashCall<T>(
  operationName: string,
  callback: (idToken: string) => Promise<T>,
) {
  let idToken = await getBkashIdToken();

  try {
    return await callback(idToken);
  } catch (error) {
    if (!isAuthError(error)) {
      throw error;
    }

    logger.warn('payments.bkash.token.retry', { operationName });
    idToken = await grantToken();
    return callback(idToken);
  }
}

export async function createBkashPayment(
  payload: BkashCreatePaymentRequest,
  idempotencyKey: string,
) {
  return withAuthorizedBkashCall<BkashCreatePaymentResponse>('create-payment', async (idToken) =>
    bkashFetch<BkashCreatePaymentResponse>(BKASH_CREATE_PAYMENT_PATH, {
      method: 'POST',
      headers: buildBkashHeaders(idToken, idempotencyKey),
      body: JSON.stringify(payload),
    }),
  );
}

export async function executeBkashPayment(paymentId: string) {
  return withAuthorizedBkashCall<BkashExecutePaymentResponse>('execute-payment', async (idToken) =>
    bkashFetch<BkashExecutePaymentResponse>(BKASH_EXECUTE_PAYMENT_PATH, {
      method: 'POST',
      headers: buildBkashHeaders(idToken),
      body: JSON.stringify({ paymentID: paymentId }),
    }),
  );
}

export async function queryBkashPayment(paymentId: string) {
  return withAuthorizedBkashCall<BkashQueryPaymentResponse>('query-payment', async (idToken) =>
    bkashFetch<BkashQueryPaymentResponse>(BKASH_QUERY_PAYMENT_PATH, {
      method: 'POST',
      headers: buildBkashHeaders(idToken),
      body: JSON.stringify({ paymentID: paymentId }),
    }),
  );
}

export { BkashApiError };
