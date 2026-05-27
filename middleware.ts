import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { securityHeaders } from '@/src/lib/security';
import { isAllowedRequestOrigin } from '@/src/server/security/origin';

const protectedPrefixes = ['/account', '/seller', '/reseller-dashboard', '/admin'];

function applyHeaders(response: NextResponse) {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    const hasAccessToken = Boolean(request.cookies.get('access_token')?.value);
    if (!hasAccessToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return applyHeaders(NextResponse.redirect(loginUrl));
    }
  }

  if (pathname.startsWith('/api')) {
    const origin = request.headers.get('origin');

    if (origin && !isAllowedRequestOrigin(origin, request.nextUrl.origin)) {
      return applyHeaders(NextResponse.json({ error: 'Origin not allowed' }, { status: 403 }));
    }

    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 });
      response.headers.set('Access-Control-Allow-Origin', origin || request.nextUrl.origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Requested-With,X-Request-Id');
      response.headers.set('Vary', 'Origin');
      return applyHeaders(response);
    }

    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', origin || request.nextUrl.origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Requested-With,X-Request-Id');
    response.headers.set('Vary', 'Origin');
    return applyHeaders(response);
  }

  return applyHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|icon.svg).*)'],
};
