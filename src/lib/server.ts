import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export { prisma } from '../features/shared/services/database/prisma';
export {
  getCurrentUser,
  requireUser,
  requireApiUser,
  requireDashboardAccess,
  requireRole,
  requireAdminRole,
  requireSellerRole,
  requirePermission,
  secureApiRoute,
  type AuthenticatedUser,
  type DashboardAccessResult,
  type Role,
  type SecureApiResult,
} from '@/server/auth';

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

function getSupabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; middleware/API routes handle mutable cases.
        }
      },
    },
  });
}
