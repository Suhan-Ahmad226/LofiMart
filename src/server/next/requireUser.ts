import { NextResponse } from 'next/server';
import { validateAccessToken } from '../../services/auth/sessionStore';
import { isRole, type Role } from '@/src/modules/rbac/roles';
import { can, type Permission } from '@/src/modules/rbac';

export type ApiUser = {
  id: number | string;
  role: string;
  tenantId?: string | null;
  [key: string]: unknown;
};

export async function requireUser(req: Request): Promise<ApiUser | NextResponse> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const user = await validateAccessToken(token);
    return user;
  } catch {
    return NextResponse.json(
      { error: 'Session expired. Please log in again.', code: 'SESSION_EXPIRED' },
      { status: 403 },
    );
  }
}

export function requireRole(user: ApiUser, roles: Role[]): NextResponse | null {
  if (!isRole(user.role) || !roles.includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  return null;
}

export function requirePermission(user: ApiUser, permission: Permission): NextResponse | null {
  if (!isRole(user.role) || !can(user.role, permission)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}
