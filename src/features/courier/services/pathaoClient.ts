import { getServerEnv } from '../../../lib/env';
import { ensureRedis } from '../../../features/shared/services/messaging/redis';

type PathaoTokenBundle = {
  tokenType: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn: number;
  issuedAt: number;
};

type PathaoTokenGrantMode = 'password' | 'refresh_token';

export type PathaoStorePayload = {
  name: string;
  contact_name: string;
  contact_number: string;
  secondary_contact?: string;
  otp_number?: string;
  address: string;
  city_id: number;
  zone_id: number;
  area_id: number;
};

export type PathaoSingleOrderPayload = {
  store_id: number;
  merchant_order_id?: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_secondary_phone?: string;
  recipient_address: string;
  recipient_city?: number;
  recipient_zone?: number;
  recipient_area?: number;
  delivery_type: 12 | 48;
  item_type: 1 | 2;
  special_instruction?: string;
  item_quantity: number;
  item_weight: number | string;
  item_description?: string;
  amount_to_collect: number;
};

export type PathaoBulkOrderPayload = {
  orders: PathaoSingleOrderPayload[];
};

const TOKEN_KEY_SUFFIX = 'logistics:pathao:oauth';
const DEFAULT_WEBHOOK_INTEGRATION_SECRET = 'f3992ecc-59da-4cbe-a049-a13da2018d51';

function normalizeUrl(baseUrl: string, endpoint: string) {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
}

function getTokenCacheKey() {
  const env = getServerEnv();
  const base = String(env.PATHAO_BASE_URL || '').trim().toLowerCase();
  const client = String(env.PATHAO_CLIENT_ID || '').trim().toLowerCase();
  return `${env.QUEUE_PREFIX}:${TOKEN_KEY_SUFFIX}:${base}:${client}`;
}

async function readTokenBundle(): Promise<PathaoTokenBundle | null> {
  const redis = await ensureRedis();
  const raw = await redis.get(getTokenCacheKey());

  if (!raw) return null;

  try {
    return JSON.parse(raw) as PathaoTokenBundle;
  } catch {
    return null;
  }
}

async function writeTokenBundle(bundle: PathaoTokenBundle) {
  const redis = await ensureRedis();
  const ttlSeconds = Math.max(60, Math.floor(bundle.expiresIn - 120));
  await redis.set(getTokenCacheKey(), JSON.stringify(bundle), 'EX', ttlSeconds);
}

async function clearTokenBundle() {
  const redis = await ensureRedis();
  await redis.del(getTokenCacheKey());
}

function isTokenFresh(bundle: PathaoTokenBundle | null) {
  if (!bundle?.accessToken) return false;
  const expiryMs = bundle.issuedAt + bundle.expiresIn * 1000;
  return expiryMs - Date.now() > 120000;
}

async function requestPathaoToken(payload: Record<string, unknown>) {
  const env = getServerEnv();
  const url = normalizeUrl(env.PATHAO_BASE_URL || '', '/aladdin/api/v1/issue-token');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const responsePayload = await response.json().catch(() => null);
  if (!response.ok) {
    const responseMessage =
      responsePayload && typeof responsePayload === 'object'
        ? String(
            (responsePayload as { message?: unknown; error?: unknown }).message ??
              (responsePayload as { message?: unknown; error?: unknown }).error ??
              '',
          )
        : '';
    const message = responseMessage || `Pathao token request failed with status ${response.status}`;

    throw new Error(message);
  }

  const tokenType = String((responsePayload as any)?.token_type || 'Bearer');
  const accessToken = String((responsePayload as any)?.access_token || '');
  const refreshToken = typeof (responsePayload as any)?.refresh_token === 'string' ? String((responsePayload as any).refresh_token) : null;
  const expiresIn = Number((responsePayload as any)?.expires_in || 0);

  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('Pathao token response is missing access token metadata.');
  }

  const bundle: PathaoTokenBundle = {
    tokenType,
    accessToken,
    refreshToken,
    expiresIn,
    issuedAt: Date.now(),
  };

  await writeTokenBundle(bundle);
  return bundle;
}

export async function issuePathaoAccessToken(options?: {
  mode?: PathaoTokenGrantMode;
  refreshToken?: string | null;
  force?: boolean;
}) {
  const env = getServerEnv();
  const requestedMode = options?.mode;
  const refreshToken = options?.refreshToken;
  const force = options?.force === true;

  if (!force) {
    const existing = await readTokenBundle();
    if (isTokenFresh(existing) && requestedMode !== 'refresh_token' && requestedMode !== 'password') {
      return existing as PathaoTokenBundle;
    }

    if (requestedMode !== 'password' && (refreshToken || existing?.refreshToken)) {
      try {
        return await requestPathaoToken({
          client_id: env.PATHAO_CLIENT_ID,
          client_secret: env.PATHAO_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken || existing?.refreshToken,
        });
      } catch {
        // Fall back to password grant below.
      }
    }
  }

  if (!env.PATHAO_CLIENT_ID || !env.PATHAO_CLIENT_SECRET || !env.PATHAO_USERNAME || !env.PATHAO_PASSWORD || !env.PATHAO_BASE_URL) {
    throw new Error('Pathao OAuth configuration is incomplete.');
  }

  return requestPathaoToken({
    client_id: env.PATHAO_CLIENT_ID,
    client_secret: env.PATHAO_CLIENT_SECRET,
    grant_type: 'password',
    username: env.PATHAO_USERNAME,
    password: env.PATHAO_PASSWORD,
  });
}

export async function getPathaoAccessToken() {
  return issuePathaoAccessToken();
}

export async function refreshPathaoAccessToken() {
  const existing = await readTokenBundle();
  await clearTokenBundle();
  return issuePathaoAccessToken({
    mode: existing?.refreshToken ? 'refresh_token' : 'password',
    refreshToken: existing?.refreshToken,
    force: true,
  });
}

async function doPathaoRequest<T = any>(endpoint: string, init?: RequestInit) {
  const env = getServerEnv();
  const token = await getPathaoAccessToken();
  const url = normalizeUrl(env.PATHAO_BASE_URL || '', endpoint);

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Authorization: `${token.tokenType || 'Bearer'} ${token.accessToken}`,
      ...(init?.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const responseMessage =
      payload && typeof payload === 'object'
        ? String((payload as { message?: unknown; error?: unknown }).message ?? (payload as { message?: unknown; error?: unknown }).error ?? '')
        : '';
    const message = responseMessage || `Pathao request failed with status ${response.status}`;

    throw new Error(message);
  }

  return payload as T;
}

async function pathaoRequest<T = any>(endpoint: string, init?: RequestInit) {
  try {
    return await doPathaoRequest<T>(endpoint, init);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const shouldRetry =
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('token');

    if (!shouldRetry) {
      throw error;
    }

    await clearTokenBundle();
    return doPathaoRequest<T>(endpoint, init);
  }
}

export async function listPathaoCities() {
  return pathaoRequest('/aladdin/api/v1/city-list');
}

export async function listPathaoZones(cityId: number) {
  return pathaoRequest(`/aladdin/api/v1/cities/${cityId}/zone-list`);
}

export async function listPathaoAreas(zoneId: number) {
  return pathaoRequest(`/aladdin/api/v1/zones/${zoneId}/area-list`);
}

export async function listPathaoStores() {
  return pathaoRequest('/aladdin/api/v1/stores');
}

export async function getPathaoStoreInfo(storeId: number) {
  const payload = await listPathaoStores();
  const items = Array.isArray((payload as any)?.data?.data) ? (payload as any).data.data : [];
  return items.find((item: any) => Number(item?.store_id || 0) === Number(storeId)) || null;
}

export async function createPathaoStore(payload: PathaoStorePayload) {
  return pathaoRequest('/aladdin/api/v1/stores', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createPathaoOrder(payload: PathaoSingleOrderPayload | Record<string, unknown>) {
  const env = getServerEnv();
  const endpoint = env.PATHAO_BOOKING_ENDPOINT || '/aladdin/api/v1/orders';
  return pathaoRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createPathaoBulkOrders(orders: PathaoSingleOrderPayload[] | Record<string, unknown>[]) {
  return pathaoRequest('/aladdin/api/v1/orders/bulk', {
    method: 'POST',
    body: JSON.stringify({ orders }),
  });
}

export async function getPathaoOrderInfo(consignmentId: string) {
  return pathaoRequest(`/aladdin/api/v1/orders/${consignmentId}/info`);
}

export async function calculatePathaoPrice(payload: {
  store_id: number;
  item_type: 1 | 2;
  delivery_type: 12 | 48;
  item_weight: number;
  recipient_city: number;
  recipient_zone: number;
}) {
  return pathaoRequest('/aladdin/api/v1/merchant/price-plan', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getPathaoWebhookIntegrationSecret() {
  return DEFAULT_WEBHOOK_INTEGRATION_SECRET;
}

export async function getPathaoTokenDiagnostics() {
  const env = getServerEnv();
  const bundle = await readTokenBundle();
  const now = Date.now();
  const expiresAt = bundle ? bundle.issuedAt + bundle.expiresIn * 1000 : null;

  return {
    baseUrl: env.PATHAO_BASE_URL || null,
    hasCachedToken: Boolean(bundle?.accessToken),
    tokenType: bundle?.tokenType || null,
    issuedAt: bundle ? new Date(bundle.issuedAt).toISOString() : null,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    expiresInSeconds: bundle ? Math.max(0, Math.floor((expiresAt! - now) / 1000)) : null,
    refreshTokenAvailable: Boolean(bundle?.refreshToken),
  };
}
