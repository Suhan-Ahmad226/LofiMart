import type { User } from '@/features/shared/state/UserContext';

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
}): Promise<{ user: User; isNewUser?: boolean }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_EXCHANGE_TIMEOUT_MS);

  try {
    const response = await fetch('/api/auth/supabase/exchange', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const err = new Error(extractAuthMessage(data) || 'Failed to sync Supabase session') as Error & {
        code?: string;
        identifier?: string;
        purpose?: string;
        phone?: string | null;
      };
      err.code = data?.code;
      err.identifier = data?.identifier;
      err.purpose = data?.purpose;
      err.phone = typeof data?.phone === 'string' ? data.phone : null;
      throw err;
    }

    return data;
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw new Error('Authentication timed out. Please try again.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loginWithPassword(params: {
  identifier: string;
  password: string;
  redirectTarget?: string;
}): Promise<{ user: User; accessToken: string }> {
  const response = await fetch('/api/auth/supabase/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error: Error & { code?: string; identifier?: string; requiresVerification?: boolean; purpose?: string } = new Error(
      extractAuthMessage(data) || 'Unable to sign in right now.',
    );
    error.code = typeof data?.code === 'string' ? data.code : undefined;
    error.identifier = typeof data?.identifier === 'string' ? data.identifier : undefined;
    error.requiresVerification = Boolean(data?.requiresVerification);
    error.purpose = typeof data?.purpose === 'string' ? data.purpose : undefined;
    throw error;
  }

  const accessToken = data?.session?.access_token;
  const refreshToken = data?.session?.refresh_token;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new Error('The sign-in response did not include a valid Supabase session.');
  }

  const supabase = await getSupabaseBrowserClient();
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (sessionError) {
    throw new Error(sessionError.message || 'Unable to sync the Supabase browser session.');
  }

  return { user: data.user, accessToken };
}

export function normalizeRedirectTarget(value: string | null | undefined) {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return null;
  }

  return value;
}

export async function verifyOtpCode(params: {
  identifier: string;
  purpose: string;
  pin: string;
}) {
  const response = await fetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error: Error & { code?: string } = new Error(extractAuthMessage(data) || 'Verification failed. Please try again.');
    error.code = typeof data?.code === 'string' ? data.code : undefined;
    throw error;
  }

  return data;
}

export async function resendOtpCode(params: { identifier: string; purpose: string; phone?: string }) {
  const response = await fetch('/api/auth/resend-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error: Error & { code?: string } = new Error(extractAuthMessage(data) || 'Unable to resend the code right now.');
    error.code = typeof data?.code === 'string' ? data.code : undefined;
    throw error;
  }

  return data;
}

export async function requestEmailVerification(params: { identifier: string }) {
  const response = await fetch('/api/auth/request-email-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractAuthMessage(data) || 'Unable to send a verification code right now.');
  }

  return data;
}

export async function requestPasswordReset(params: { identifier: string }) {
  const response = await fetch('/api/auth/request-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractAuthMessage(data) || 'Unable to send a reset code right now.');
  }

  return data;
}

export async function resetPasswordWithOtp(params: {
  identifier: string;
  newPassword: string;
  recoveryToken?: string;
}) {
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: params.identifier,
      newPassword: params.newPassword,
      ...(params.recoveryToken ? { token: params.recoveryToken } : {}),
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error: Error & { code?: string } = new Error(extractAuthMessage(data) || 'Unable to reset your password right now.');
    error.code = typeof data?.code === 'string' ? data.code : undefined;
    throw error;
  }

  return data;
}

export function isRouteAllowedForRole(role: string, targetPath: string): boolean {
  const normalizedPath = targetPath.toLowerCase();

  if (normalizedPath.startsWith('/admin')) {
    return role === 'admin';
  }

  if (normalizedPath.startsWith('/seller')) {
    return role === 'seller' || role === 'admin';
  }

  if (normalizedPath.startsWith('/reseller-dashboard') || normalizedPath.startsWith('/reseller')) {
    return role === 'reseller' || role === 'admin';
  }

  if (normalizedPath.startsWith('/account')) {
    return role === 'customer' || role === 'admin' || role === 'seller' || role === 'reseller';
  }

  return true;
}

export function getRoleHome(role: string): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'seller') return '/seller/dashboard';
  if (role === 'reseller') return '/reseller-dashboard/overview';
  return '/account/dashboard';
}

export function resolvePostAuthDestination(userRole: string, redirectTarget: string | null) {
  if (redirectTarget && isRouteAllowedForRole(userRole, redirectTarget)) {
    return redirectTarget;
  }

  return getRoleHome(userRole);
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
  // Preserve the exact origin where OAuth was initiated. Do not use
  // NEXT_PUBLIC_SITE_URL here because production and development aliases
  // must each return to their own auth callback.
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin.replace(/\/+$/, '')
      : '';

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
    return 'Invalid email, phone, or password. Please try again.';
  }

  if (
    normalized.includes('email not confirmed') ||
    normalized.includes('email not verified') ||
    normalized.includes('confirm your email')
  ) {
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

  if (normalized.includes('email already exists') || normalized.includes('already registered') || normalized.includes('account already exists') || normalized.includes('login to continue')) {
    return 'এই ইমেইল বা ফোন নম্বর দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। Login করুন।';
  }

  if (normalized.includes('email rate limit exceeded')) {
    return 'অনেকবার OTP পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করুন।';
  }

  if (normalized.includes('over_email_send_rate_limit')) {
    return 'অনেকবার OTP পাঠানো হয়েছে। কিছুক্ষণ অপেক্ষা করুন।';
  }

  if (normalized.includes('registration failed')) {
    return 'We could not create your account right now. Please try again in a moment.';
  }

  if (normalized.includes('otp invalid') || normalized.includes('invalid') && normalized.includes('otp') || normalized.includes('verification code is required')) {
    return 'OTP সঠিক নয়। আবার চেষ্টা করুন।';
  }

  if (normalized.includes('supabase auth is not configured')) {
    return 'অথেন্টিকেশন এই মুহূর্তে কনফিগার করা যায়নি। আবার চেষ্টা করুন।';
  }

  if (normalized.includes('rate limit') || normalized.includes('rate_limit') || normalized.includes('please wait')) {
    return 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।';
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
