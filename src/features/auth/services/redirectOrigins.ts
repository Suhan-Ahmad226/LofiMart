import { getServerEnv } from '@/lib/env';

export function isRedirectUrlAllowed(url: string, allowedOrigins: string[]): boolean {
  try {
    const parsed = new URL(url);
    return allowedOrigins.some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        return parsed.origin === allowedUrl.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function getTrustedRedirectOrigins(sameOrigin?: string | null): string[] {
  const env = getServerEnv();
  const origins = new Set<string>();

  if (env.FRONTEND_URL) {
    origins.add(env.FRONTEND_URL);
  }

  for (const origin of env.CORS_ALLOWED_ORIGINS ?? []) {
    origins.add(origin);
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    origins.add(process.env.NEXT_PUBLIC_SITE_URL);
  }

  if (sameOrigin) {
    origins.add(sameOrigin);
  }

  const isProduction = env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!isProduction) {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return [...origins];
}