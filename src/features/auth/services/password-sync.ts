import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';

export type SupabasePasswordSyncResult =
  | { ok: true }
  | { ok: false; reason: 'no-supabase-identity' | 'not-configured' | 'supabase-error' };

/**
 * Updates the Supabase Auth password for an account linked to a LofiMart
 * Prisma user. Supabase remains the sole password authority.
 */
export async function syncSupabasePassword(opts: {
  supabaseAuthId?: string | null;
  newPassword: string;
}): Promise<SupabasePasswordSyncResult> {
  if (!opts.supabaseAuthId) {
    return { ok: false, reason: 'no-supabase-identity' };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: 'not-configured' };
  }

  try {
    const supabase = createSupabaseServerClient(true);
    const { error } = await supabase.auth.admin.updateUserById(opts.supabaseAuthId, {
      password: opts.newPassword,
    });

    if (error) {
      console.warn('[auth:password] Supabase password sync failed', error.message);
      return { ok: false, reason: 'supabase-error' };
    }

    return { ok: true };
  } catch (error) {
    console.warn(
      '[auth:password] Supabase password sync threw',
      error instanceof Error ? error.message : error,
    );
    return { ok: false, reason: 'supabase-error' };
  }
}

