import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateAccessToken, type SessionUser } from '@/src/services/auth/sessionStore';
import { isRole, type Role } from '@/src/modules/rbac/roles';

function roleHome(role: string) {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'seller') return '/seller/dashboard';
  if (role === 'reseller') return '/reseller-dashboard/overview';
  return '/account/dashboard';
}

export async function requireDashboardAccess(allowedRoles: Role[], currentPath: string): Promise<SessionUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  if (!token) {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  let user: SessionUser;
  try {
    user = await validateAccessToken(token);
  } catch {
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  if (!isRole(user.role) || !allowedRoles.includes(user.role)) {
    redirect(roleHome(user.role));
  }

  return user;
}
