import { getServerEnv } from '../../lib/env';

export function getAllowedOrigins() {
  const env = getServerEnv();
  const allowed = new Set<string>([env.FRONTEND_URL, ...env.CORS_ALLOWED_ORIGINS]);

  if (env.APP_ENV !== 'production' || process.env.NODE_ENV !== 'production') {
    [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:4010',
      'http://127.0.0.1:4010',
      'http://localhost:3101',
      'http://127.0.0.1:3101',
      'http://localhost:4110',
      'http://127.0.0.1:4110',
    ].forEach((origin) => allowed.add(origin));
  }

  return allowed;
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isEquivalentLoopbackOrigin(left: string, right: string) {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);

    return (
      leftUrl.protocol === rightUrl.protocol &&
      leftUrl.port === rightUrl.port &&
      isLoopbackHostname(leftUrl.hostname) &&
      isLoopbackHostname(rightUrl.hostname)
    );
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | null) {
  if (!origin) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (!normalized) {
    return false;
  }

  return getAllowedOrigins().has(normalized);
}

export function isAllowedRequestOrigin(origin: string | null, requestUrlOrHost?: string | null) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  if (isAllowedOrigin(normalizedOrigin)) {
    return true;
  }

  if (!requestUrlOrHost) {
    return false;
  }

  const normalizedRequestOrigin = requestUrlOrHost.startsWith('http://') || requestUrlOrHost.startsWith('https://')
    ? normalizeOrigin(requestUrlOrHost)
    : normalizeOrigin(`http://${requestUrlOrHost}`);

  return normalizedRequestOrigin === normalizedOrigin || (
    normalizedRequestOrigin !== null && isEquivalentLoopbackOrigin(normalizedRequestOrigin, normalizedOrigin)
  );
}
