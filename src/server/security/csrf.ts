import crypto from 'node:crypto';

const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE = 'csrf-token';

export function issueCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function getCsrfCookieHeader(token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax${secure}`;
}

export function validateCsrfToken(req: any) {
  const headerToken = req.headers[CSRF_HEADER] || req.headers[CSRF_HEADER.toUpperCase()];
  const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : '';
  const cookieToken = cookieHeader
    .split(';')
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith(`${CSRF_COOKIE}=`))
    ?.split('=')
    ?.slice(1)
    .join('=');

  return Boolean(headerToken && cookieToken && headerToken === cookieToken);
}

export function requireCsrf(req: any, res: any, next: any) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(String(req.method).toUpperCase())) {
    return next();
  }

  const hasBearerToken = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
  if (!hasBearerToken) {
    return next();
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
}

export const csrfCookieName = CSRF_COOKIE;
export const csrfHeaderName = CSRF_HEADER;
