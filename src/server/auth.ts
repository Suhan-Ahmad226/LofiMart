import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma, createClient } from '@/lib/server';
import type { Role } from '@/modules/rbac/roles';
import { isRole } from '@/modules/rbac/roles';
import { can } from '@/modules/rbac/authorize';
import type { Permission } from '@/modules/rbac/permissions';

export type AuthenticatedUser = {
  authUserId: string;
  userId: string;
  id: string;
  role: Role;
  email: string | null;
  phone: string | null;
  name: string | null;
  tenantId: string | null;
};

export type { Role };

type RequestLike = Request | NextRequest | undefined;

function readBearerToken(req: RequestLike): string | null {
  if (!req) {
    return null;
  }

  const header = req.headers?.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (bearer) {
    return bearer;
  }

  return null;
}

export async function getCurrentUser(req?: RequestLike): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const accessToken = readBearerToken(req);
  // getClaims verifies the JWT and is the preferred fast server-side auth check.
  // getUser performs an Auth network request on every call, which made dashboard
  // navigation unnecessarily slow. We only need the verified subject here;
  // Prisma remains the source for the application's role/profile data.
  const { data, error } = accessToken
    ? await supabase.auth.getClaims(accessToken)
    : await supabase.auth.getClaims();
  const claims = data?.claims;
  const authUserId = typeof claims?.sub === 'string' ? claims.sub : '';
  const authEmail = typeof claims?.email === 'string' ? claims.email : null;

  if (error || !authUserId) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { supabaseAuthId: authUserId },
    select: {
      id: true,
      role: true,
      email: true,
      phone: true,
      name: true,
      tenantId: true,
      isBlocked: true,
      deactivatedAt: true,
    },
  });

  if (!dbUser?.id || !isRole(dbUser.role)) {
    return null;
  }

  if (dbUser.isBlocked || dbUser.deactivatedAt) {
    return null;
  }

  return {
    authUserId,

    userId: dbUser.id,
    id: dbUser.id,
    role: dbUser.role,
    email: dbUser.email ?? authEmail,
    phone: dbUser.phone,
    name: dbUser.name,
    tenantId: dbUser.tenantId ?? null,
  };
}

export async function requireUser(req?: RequestLike): Promise<AuthenticatedUser | NextResponse> {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}

export async function requireApiUser(
  req?: NextRequest,
): Promise<AuthenticatedUser | NextResponse> {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return user;
}

export type DashboardAccessResult = {
  authorized: boolean;
  user: AuthenticatedUser | null;
  redirectTo: string;
};

export async function requireDashboardAccess(
  allowedRoles: Role[],
  fallbackRedirect = '/',
): Promise<DashboardAccessResult> {
  const user = await getCurrentUser();

  const authorized = Boolean(user && allowedRoles.includes(user.role));
  const redirectTo = !user ? '/login' : authorized ? fallbackRedirect : '/';

  return { authorized, user, redirectTo };
}

export function requireAdminRole(user: AuthenticatedUser): NextResponse | null {
  return requireRole(user, ['admin']);
}

export function requireSellerRole(user: AuthenticatedUser): NextResponse | null {
  return requireRole(user, ['seller']);
}

export function requireRole(user: AuthenticatedUser, roles: Role[]): NextResponse | null {
  if (user.role !== 'admin' && !roles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export function requirePermission(user: AuthenticatedUser, permission: Permission): NextResponse | null {
  if (!can(user.role, permission)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export type SecureApiResult =
  | { authorized: true; user: AuthenticatedUser }
  | NextResponse;

export async function secureApiRoute(
  req?: RequestLike,
  options: {
    keyPrefix?: string;
    limit?: number;
    enforceOriginForMutations?: boolean;
    requireAuth?: boolean;
    roles?: Role[];
  } = {},
): Promise<SecureApiResult> {
  if (options.requireAuth !== false) {
    const user = await getCurrentUser(req);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (options.roles && options.roles.length > 0) {
      if (!options.roles.includes(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return { authorized: true, user };
  }

  const guestUser: AuthenticatedUser = {
    authUserId: 'public',
    userId: 'public',
    id: 'public',
    role: 'guest',
    email: null,
    phone: null,
    name: null,
    tenantId: null,
  };

  return { authorized: true, user: guestUser };
}
