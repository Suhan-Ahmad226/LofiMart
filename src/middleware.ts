import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const BOT_USER_AGENTS = [
  /gptbot/i,
  /chatgpt-user/i,
  /ccbot/i,
  /anthropic-ai/i,
  /claudebot/i,
  /google-extended/i,
  /bytespider/i,
  /omgili/i,
  /cohere-ai/i,
  /petalbot/i,
  /semrushbot/i,
  /ahrefbot/i,
  /mj12bot/i,
  /dotbot/i,
  /bingbot/i,
];

const SENSITIVE_PATHS = [
  /^\/api\/auth/,
  /^\/api\/payment/,
  /^\/api\/admin/,
  /^\/api\/seller/,
  /^\/api\/checkout/,
];

function isBotRequest(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return BOT_USER_AGENTS.some((pattern) => pattern.test(userAgent));
}

function addSecurityHeaders(response: NextResponse, isProd: boolean): NextResponse {
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (isProd) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userAgent = request.headers.get('user-agent');
  const isProd = process.env.NODE_ENV === 'production';

  if (isBotRequest(userAgent)) {
    if (SENSITIVE_PATHS.some((p) => p.test(pathname))) {
      return new NextResponse(null, { status: 403 });
    }
  }

  if (pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204 });
  }

  if (pathname.startsWith('/api/')) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    const response = NextResponse.next();
    response.headers.set('x-request-id', requestId);
    addSecurityHeaders(response, isProd);
    return response;
  }

  const response = NextResponse.next();
  addSecurityHeaders(response, isProd);

  if (pathname.startsWith('/admin') || pathname.startsWith('/seller') || pathname.startsWith('/reseller-dashboard')) {
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  }

  if (pathname.startsWith('/_next/') || pathname.includes('.')) {
    if (isProd) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
