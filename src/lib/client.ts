import { createClient as createSupabaseBrowserClient } from '@supabase/supabase-js';

type BrowserSupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;

declare global {
  // eslint-disable-next-line no-var
  var __lofimartSupabaseBrowserClient__: BrowserSupabaseClient | undefined;
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function hasSupabaseBrowserEnv() {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

export function createClient() {
  if (!hasSupabaseBrowserEnv()) {
    throw new Error(
      'Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.',
    );
  }

  if (!globalThis.__lofimartSupabaseBrowserClient__) {
    globalThis.__lofimartSupabaseBrowserClient__ = createSupabaseBrowserClient(getSupabaseUrl()!, getSupabaseKey()!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }

  return globalThis.__lofimartSupabaseBrowserClient__;
}
