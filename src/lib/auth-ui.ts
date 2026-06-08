export type AccountRole = 'customer' | 'seller' | 'reseller';

const AUTH_EXCHANGE_TIMEOUT_MS = 15_000;
const PENDING_OAUTH_STORAGE_KEY = 'lofimart_pending_oauth';

function extractAuthMessage(input: unknown): string {
  if (typeof input === 'string') {
    const normalized = input.trim();
    if (!normalized || normalized === '{}' || normalized === '[object Object]' || normalized === 'null' || normalized === 'undefined') {
      return '';
    }
    return normalized;
  }

  if (input instanceof Error) {
    return input.message;
  }

  if (input && typeof input === 'object') {
    const maybeMessage =
      'message' in input
        ? extractAuthMessage((input as { message?: unknown }).message)
        : 'error' in input
          ? extractAuthMessage((input as { error?: unknown }).error)
          : '';

    if (maybeMessage) {
      return maybeMessage;
    }
  }

  return '';
}

export function hasSupabaseBrowserEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export async function getSupabaseBrowserClient() {
  const { createClient } = await import('@/lib/client');
  return createClient();
}

export async function exchangeSupabaseSession(params: {
  accessToken: string;
  role?: string;
  name?: string;
  referralCode?: string;
  mode?: 'login' | 'register';
}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_EXCHANGE_TIMEOUT_MS);

  try {
    const response = await fetch('/api/auth/supabase/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(extractAuthMessage(data) || 'Failed to sync Supabase session');
    }

    return data;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Authentication timed out. Please try again.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function normalizeRedirectTarget(value: string | null) {
  if (!value || !value.startsWith('/')) {
    return null;
  }

  return value;
}

export function resolvePostAuthDestination(userRole: string, redirectTarget: string | null) {
  if (redirectTarget) {
    return redirectTarget;
  }

  if (userRole === 'admin') return '/admin/dashboard';
  if (userRole === 'seller') return '/seller/dashboard';
  if (userRole === 'reseller') return '/reseller-dashboard/overview';
  return '/account/dashboard';
}

export function buildAuthCallbackUrl(options?: {
  redirectTarget?: string | null;
  role?: AccountRole;
  referralCode?: string;
  mode?: 'login' | 'register';
}) {
  const params = new URLSearchParams();

  if (options?.redirectTarget) {
    params.set('redirect', options.redirectTarget);
  }

  if (options?.role) {
    params.set('role', options.role);
  }

  if (options?.referralCode) {
    params.set('ref', options.referralCode);
  }

  if (options?.mode) {
    params.set('mode', options.mode);
  }

  const query = params.toString();
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const origin =
    configuredSiteUrl && typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? configuredSiteUrl.replace(/\/+$/, '')
      : window.location.origin;

  return `${origin}/auth/callback${query ? `?${query}` : ''}`;
}

export function rememberPendingOAuthRedirect(options?: {
  redirectTarget?: string | null;
  role?: AccountRole;
  referralCode?: string;
  mode?: 'login' | 'register';
}) {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      PENDING_OAUTH_STORAGE_KEY,
      JSON.stringify({
        redirectTarget: options?.redirectTarget || null,
        role: options?.role || null,
        referralCode: options?.referralCode || null,
        mode: options?.mode || 'login',
      }),
    );
  } catch {
    // Storage can be unavailable in privacy modes; OAuth still works without this hint.
  }
}

export function getPendingOAuthRedirect() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(PENDING_OAUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      redirectTarget?: string | null;
      role?: AccountRole | null;
      referralCode?: string | null;
      mode?: 'login' | 'register';
    };
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingOAuthRedirect() {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(PENDING_OAUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getPasswordStrength(password: string) {
  if (!password) {
    return { label: 'Add a password', tone: 'bg-slate-200', width: 'w-0' };
  }

  const score =
    Number(password.length >= 8) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));

  if (score <= 1) {
    return { label: 'Weak password', tone: 'bg-rose-500', width: 'w-1/4' };
  }

  if (score === 2) {
    return { label: 'Fair password', tone: 'bg-amber-500', width: 'w-2/4' };
  }

  if (score === 3) {
    return { label: 'Strong password', tone: 'bg-sky-500', width: 'w-3/4' };
  }

  return { label: 'Very strong password', tone: 'bg-emerald-500', width: 'w-full' };
}

export function mapAuthMessage(message: unknown) {
  const safeMessage = extractAuthMessage(message) || 'Authentication could not be completed right now.';
  const normalized = String(safeMessage || '').trim().toLowerCase();

  if (!normalized) {
    return 'Authentication could not be completed right now.';
  }

  if (normalized.includes('invalid login credentials')) {
    return 'Invalid email or password. Please try again.';
  }

  if (normalized.includes('email not confirmed') || normalized.includes('confirm')) {
    return 'Your email is not verified yet. Please verify it first, then sign in again.';
  }

  if (normalized.includes('session expired') || normalized.includes('token expired')) {
    return 'Your session expired. Please sign in again.';
  }

  if (normalized.includes('failed to complete sign in') || normalized.includes('failed to complete sign-in')) {
    return 'We could not complete your sign-in. Please try again.';
  }

  if (normalized.includes('supabase session not found')) {
    return 'Your social sign-in session could not be confirmed. Please try again.';
  }

  if (normalized.includes('pkce code verifier not found')) {
    return 'Your social sign-in session could not be completed in this browser. Please try again from the same tab.';
  }

  if (normalized.includes('supabase auth is not configured')) {
    return 'Authentication is not configured correctly for this environment yet.';
  }

  if (normalized.includes('email already exists') || normalized.includes('already registered')) {
    return 'This email is already registered. Please sign in or verify your existing account.';
  }

  if (normalized.includes('email rate limit exceeded')) {
    return 'Too many verification emails were requested recently. Please wait a few minutes and try again.';
  }

  if (normalized.includes('over_email_send_rate_limit')) {
    return 'Too many verification emails were requested recently. Please wait a few minutes and try again.';
  }

  if (normalized.includes('registration failed')) {
    return 'We could not create your authentication account right now. Please try again in a moment.';
  }

  if (normalized.includes('gateway timeout') || normalized.includes('504')) {
    return 'The authentication service took too long to respond. Please wait a moment and try again.';
  }

  if (normalized.includes('failed to fetch') || normalized.includes('network request failed')) {
    return 'We could not reach the authentication service. Please check your connection and try again.';
  }

  if (normalized.includes('supabase session was not created')) {
    return 'Your account was created, but your session could not be started automatically. Please sign in after verifying your email.';
  }

  if (normalized.includes('we could not create your account right now')) {
    return 'We could not create your authentication account right now. Please try again in a moment.';
  }

  return safeMessage;
}
