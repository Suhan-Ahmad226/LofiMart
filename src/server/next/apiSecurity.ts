import { NextResponse } from 'next/server';
import { isAllowedRequestOrigin } from '../security/origin';
import { requirePermission, requireRole, requireUser, type ApiUser } from './requireUser';
import { takeRateLimitToken } from '../rateLimit';
import type { Permission } from '../../modules/rbac/index';

type SecurityOptions = {
  keyPrefix: string;
  limit?: number;
  windowMs?: number;
  requireAuth?: boolean;
  roles?: string[];
  permission?: Permission;
  enforceOriginForMutations?: boolean;
};

type AuthenticatedSecurityOptions = SecurityOptions & {
  requireAuth: true;
};

export async function secureApiRoute(
  req: Request,
  options: AuthenticatedSecurityOptions,
): Promise<ApiUser | NextResponse>;

export async function secureApiRoute(
  req: Request,
  options: SecurityOptions & { requireAuth?: false },
): Promise<NextResponse | null>;

export async function secureApiRoute(
  req: Request,
  {
    keyPrefix,
    limit = 60,
    windowMs = 60_000,
    requireAuth = false,
    roles,
    permission,
    enforceOriginForMutations = true,
  }: SecurityOptions,
) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  const rate = await takeRateLimitToken(`${keyPrefix}:${ip}`, limit, windowMs);

  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many requests, please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rate.resetAfterMs / 1000)),
        },
      },
    );
  }

  if (enforceOriginForMutations && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && !isAllowedRequestOrigin(origin, req.url)) {
      return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 });
    }
  }

  if (!requireAuth) {
    return null;
  }

  const user = await requireUser(req);
  if (user instanceof NextResponse) {
    return user;
  }

  if (roles?.length) {
    const roleResponse = requireRole(user, roles as any);
    if (roleResponse) {
      return roleResponse;
    }
  }

  if (permission) {
    const permissionResponse = requirePermission(user, permission);
    if (permissionResponse) {
      return permissionResponse;
    }
  }

  return user as ApiUser;
}
