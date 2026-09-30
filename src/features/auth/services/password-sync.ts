import { createSupabaseServerClient } from '@/app/api/auth/supabase/shared';

export type SupabasePasswordSyncResult =
  | { ok: true }
  | { ok: false; reason: 'no-supabase-identity' | 'not-configured' | 'supabase-error' };

/**
 * Updates the Supabase auth password for an account that has a Supabase
 * identity. The app's password login always authenticates through Supabase, so
 * the Supabase password must be kept in sync with the local password store.
 *
 * Uses the same admin client as set-password / reset-password — no second
 * Supabase client implementation.
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

/**
 * Best-effort rollback used when the local password record fails to update
 * AFTER the Supabase password already changed. Restores the (verified)
 * previous plain password so both stores stay in sync.
 */
export async function rollbackSupabasePassword(opts: {
  supabaseAuthId: string;
  previousPassword: string;
}): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    const supabase = createSupabaseServerClient(true);
    const { error } = await supabase.auth.admin.updateUserById(opts.supabaseAuthId, {
      password: opts.previousPassword,
    });

    if (error) {
      console.warn('[auth:password] Supabase password rollback failed', error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(
      '[auth:password] Supabase password rollback threw',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}