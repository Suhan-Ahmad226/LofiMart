import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../../../lib/navigation';
import toast from '@/lib/toast';
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Fingerprint,
  Loader2,
  Lock,
  Mail,
  ShoppingBag,
  Sparkles,
  Store,
  User,
} from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import OtpInput from '@/features/auth/components/OtpInput';
import { AuthAlert, AuthShell, InputField, PasswordVisibilityButton } from '@/features/auth/components/AuthUI';
import {
  buildAuthCallbackUrl,
  getPasswordStrength,
  getSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
  loginWithPassword,
  mapAuthMessage,
  normalizeRedirectTarget,
  rememberPendingOAuthRedirect,
  requestEmailVerification,
  resolvePostAuthDestination,
  resendOtpCode,
  verifyOtpCode,
  type AccountRole,
} from '../../../lib/auth-ui';

const bdPhoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;

function GoogleGIcon({ className = 'h-4 w-4 shrink-0' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

type RoleConfig = {
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
};

const roleConfig: Record<AccountRole, RoleConfig> = {
  customer: {
    title: 'Customer',
    description: 'Save favorites, track orders, collect rewards, and shop faster.',
    icon: <ShoppingBag size={20} strokeWidth={2.1} />,
    accent: 'from-emerald-500/20 to-cyan-500/10',
  },
  seller: {
    title: 'Seller',
    description: 'Manage products, track orders, and grow your storefront confidently.',
    icon: <Store size={20} strokeWidth={2.1} />,
    accent: 'from-amber-500/20 to-orange-500/10',
  },
  reseller: {
    title: 'Reseller',
    description: 'Share products, earn commission, and build your own sales network.',
    icon: <Sparkles size={20} strokeWidth={2.1} />,
    accent: 'from-sky-500/20 to-indigo-500/10',
  },
};

const loginHighlights = [
  'Secure email, Google, and Facebook sign-in',
  'Smart routing to customer, seller, reseller, or admin tools',
  'Quick access to orders, wishlist, wallet, and checkout',
];

const registerHighlights = [
  'Create customer, seller, or reseller accounts',
  'Role metadata stays attached after verification',
  'Ready for profile, payout, and KYC onboarding',
];

export const LoginPage = () => {
  const supabaseReady = hasSupabaseBrowserEnv();
  const [searchParams] = useSearchParams();
  const redirectTarget = normalizeRedirectTarget(searchParams.get('redirect'));
  const authError = searchParams.get('auth_error');
  const queryError = searchParams.get('error');
  const queryNotice = searchParams.get('notice');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPin, setRecoveryPin] = useState('');
  const [recoverySending, setRecoverySending] = useState(false);
  const [recoveryResendCooldown, setRecoveryResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const navigate = useNavigate();
  const { login, logout, isAuthenticated, isReady, user } = useUser();

  useEffect(() => {
    if (recoveryResendCooldown <= 0) return;
    const timerId = window.setTimeout(() => setRecoveryResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timerId);
  }, [recoveryResendCooldown]);

  useEffect(() => {
    // When the login page was reached because a protected route's server-side
    // authentication check failed (`auth_error=session_expired`), do NOT bounce
    // an apparently-authenticated localStorage user straight back to that route.
    // That bounce is the original infinite redirect loop. Suppress it here so
    // the login form remains usable.
    if (authError) {
      return;
    }

    if (!isReady || !isAuthenticated || !user) {
      return;
    }

    navigate(resolvePostAuthDestination(user.role, redirectTarget), { replace: true });
  }, [authError, isAuthenticated, isReady, navigate, redirectTarget, user]);

  useEffect(() => {
    // Auth-failure arrival: sessions are Supabase cookie sessions now, restored
    // on every page load by the browser client, so the old token-refresh
    // endpoints (/api/auth/csrf, /api/auth/refresh) no longer exist. Check the
    // live Supabase session directly. If it is still valid, restore the local
    // profile and continue to the destination (no loop). If it is gone, clear
    // all stale client state so localStorage is never treated as proof of a
    // live session, and keep the login form usable.
    if (!authError) {
      return;
    }

    let cancelled = false;

    const recover = async () => {
      setRecovering(true);
      try {
        const supabase = await getSupabaseBrowserClient();
        const { data: authData } = await supabase.auth.getUser();
        const { data: sessionData } = await supabase.auth.getSession();

        if (cancelled) {
          return;
        }

        if (authData?.user && sessionData.session?.access_token) {
          const response = await fetch('/api/users/profile', { credentials: 'include' });
          const payload = await response.json().catch(() => null);
          if (response.ok && payload?.user) {
            const recoveredUser = payload.user;
            login({ ...recoveredUser, name: recoveredUser.name || '' }, sessionData.session.access_token);
            navigate(resolvePostAuthDestination(recoveredUser.role, redirectTarget), { replace: true });
            return;
          }
        }

        logout();
      } catch {
        logout();
      } finally {
        if (!cancelled) {
          setRecovering(false);
        }
      }
    };

    void recover();

    return () => {
      cancelled = true;
    };
  }, [authError, login, logout, navigate, redirectTarget]);

  useEffect(() => {
    if (queryError) {
      setError(mapAuthMessage(queryError));
    }
    if (queryNotice === 'logged_out') {
      toast.success('You have been signed out successfully.');
    }
    if (queryNotice === 'password_changed') {
      toast.success('Password updated. Please sign in with your new password.');
    }
    if (queryNotice === 'password_set') {
      toast.success('Password set. Please sign in with your new password.');
    }
    if (queryNotice === 'set_password') {
      toast.success('Your email is verified. Use "Forgot password?" to create a password, then sign in.');
    }
  }, [queryError, queryNotice]);

const startEmailVerification = async (identifierOverride?: string) => {
      setError('');
      setRecoverySending(true);
      try {
        const identifierToUse = (identifierOverride ?? recoveryEmail).trim();
        await requestEmailVerification({ identifier: identifierToUse });
        setRecoveryResendCooldown(60);
      } catch (err: unknown) {
        setError(mapAuthMessage(err));
      } finally {
        setRecoverySending(false);
      }
    };

  const handleRecoveryVerify = async (pinOverride?: string) => {
    const pin = (pinOverride ?? recoveryPin).trim();
    setError('');
    if (pin.length < 6) {
      setError('Enter the full 6-digit verification code.');
      return;
    }

    setRecoverySending(true);
    try {
      try {
        await verifyOtpCode({ identifier: recoveryEmail, purpose: 'verify_email', pin });
      } catch (verifyErr: unknown) {
        const code = (verifyErr as { code?: string })?.code;
        if (code === 'INVALID' || code === 'EXPIRED' || code === 'MAX_ATTEMPTS') {
          setRecoveryPin('');
        }
        setError(mapAuthMessage(verifyErr));
        return;
      }

      toast.success('Email verified. Signing you in...');

      const data = await loginWithPassword({
        identifier: identifier.trim(),
        password,
        redirectTarget: redirectTarget || undefined,
      });
      login(data.user, data.accessToken);
      toast.success(`Welcome back${data.user?.name ? `, ${data.user.name}` : ''}.`);
      navigate(resolvePostAuthDestination(data.user.role, redirectTarget), { replace: true });
    } catch {
      setNeedsVerification(false);
      setRecoveryPin('');
      setError('Your email is verified. Please sign in with your email and password.');
    } finally {
      setRecoverySending(false);
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setNeedsVerification(false);

      if (!identifier.trim() || !password) {
        setError('Email or phone number and password are required.');
        return;
      }

      setLoading(true);

      try {
        const data = await loginWithPassword({ identifier, password, redirectTarget: redirectTarget || undefined });
        login(data.user, data.accessToken);
        toast.success(`Welcome back${data.user?.name ? `, ${data.user.name}` : ''}.`);
        navigate(resolvePostAuthDestination(data.user.role, redirectTarget), { replace: true });
      } catch (err: unknown) {
        if ((err as { code?: string })?.code === 'EMAIL_NOT_VERIFIED') {
          const pendingEmail = (err as { identifier?: string })?.identifier || identifier.trim();
           setNeedsVerification(true);
           setRecoveryEmail(pendingEmail);
           setRecoveryPin('');
           setRecoveryResendCooldown(0);
           void startEmailVerification(pendingEmail);
          return;
        }
        setError(mapAuthMessage(err));
      } finally {
        setLoading(false);
      }
    };

  return (
    <AuthShell
      title="Welcome back to LofiMart"
      subtitle="Sign in once and continue shopping, selling, reselling, or managing the store from the right workspace."
      highlights={loginHighlights}
      asideTitle="Your account stays ready for"
    >
      <div className="space-y-7">
        <div className="space-y-4 text-center md:text-left">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/30 md:mx-0">
            <Fingerprint size={26} strokeWidth={2.2} />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <BadgeCheck size={14} />
                Secure login
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                <Clock3 size={14} />
                Fast access
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-normal text-white font-display md:text-4xl">Sign in</h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-slate-300 md:mx-0">
              Use your verified email, Google, or Facebook account to open your LofiMart workspace.
            </p>
          </div>

          {redirectTarget && (
            <div className="inline-flex max-w-full rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
              <span className="truncate">After login: </span>
              <span className="ml-1 truncate font-semibold text-white">{redirectTarget}</span>
            </div>
          )}
        </div>

        {!supabaseReady && (
          <AuthAlert tone="warning">
            Supabase auth is not configured. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to your `.env`.
          </AuthAlert>
        )}
        {error && <AuthAlert tone="error">{error}</AuthAlert>}
        {isAuthenticated && user && authError && (
          <AuthAlert tone="info">
            You are already signed in as <span className="font-semibold">{user.name || user.email}</span>. Signing in as someone else here switches you over cleanly.
          </AuthAlert>
        )}

        {needsVerification ? (
          <div className="space-y-5">
             <AuthAlert tone="warning">
               Your email is not verified yet. Enter the 6-digit code sent to{' '}
               <span className="font-semibold">{recoveryEmail}</span> to verify it and finish signing in.
             </AuthAlert>

            <div className="space-y-4">
              <OtpInput
                value={recoveryPin}
                onChange={setRecoveryPin}
                autoFocus
                ariaLabel="Email verification code"
                onComplete={(next) => {
                  if (next.length === 6) void handleRecoveryVerify(next);
                }}
              />
              <button
                type="button"
                onClick={() => void handleRecoveryVerify()}
                disabled={recoverySending || recoveryPin.length < 6}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
              >
                {recoverySending ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify and sign in</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => void startEmailVerification()}
                disabled={recoverySending || recoveryResendCooldown > 0}
                className="font-semibold text-fuchsia-300 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recoveryResendCooldown > 0 ? `Resend code in ${recoveryResendCooldown}s` : 'Resend code'}
              </button>
              <button
                type="button"
                onClick={() => {
                setNeedsVerification(false);
                setRecoveryPin('');
                setError('');
                }}
                className="font-semibold text-slate-400 transition hover:text-slate-200 hover:underline"
              >
                Back to sign in
              </button>
            </div>
          </div>
        ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <InputField
              icon={<Mail size={18} />}
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Email address or phone number"
              autoComplete="username"
            />
            <InputField
              icon={<Lock size={18} />}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            >
              <PasswordVisibilityButton
                visible={showPassword}
                onClick={() => setShowPassword((value) => !value)}
                label={showPassword ? 'Hide password' : 'Show password'}
              />
            </InputField>
          </div>

          <div className="flex flex-col gap-2 text-sm md:flex-row md:items-center md:justify-between">
            <p className="text-slate-400">Protected session for every device.</p>
            <Link to="/forgot-password" className="font-semibold text-fuchsia-300 transition hover:text-fuchsia-200">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading || recovering || !supabaseReady}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
          >
            {recovering ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Restoring your session...</span>
              </>
            ) : loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        )}

        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-[#111126] px-3 text-slate-400">or continue with</span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={async () => {
                setError('');
                setNeedsVerification(false);
                setLoading(true);
                try {
                  if (!supabaseReady) {
                    throw new Error('Google login is unavailable until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are configured.');
                  }
                  rememberPendingOAuthRedirect({ redirectTarget, mode: 'login' });
                  const supabase = await getSupabaseBrowserClient();
                  const { error: oauthError } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: buildAuthCallbackUrl({ redirectTarget, mode: 'login' }),
                    },
                  });
                  if (oauthError) throw oauthError;
                } catch (err: unknown) {
                  setError(mapAuthMessage(err));
                  setLoading(false);
                }
              }}
              disabled={!supabaseReady}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-violet-400/40 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleGIcon />
              <span>Google</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                setError('');
                setNeedsVerification(false);
                setLoading(true);
                try {
                  if (!supabaseReady) {
                    throw new Error('Facebook login is unavailable until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are configured.');
                  }
                  rememberPendingOAuthRedirect({ redirectTarget, mode: 'login' });
                  const supabase = await getSupabaseBrowserClient();
                  const { error: oauthError } = await supabase.auth.signInWithOAuth({
                    provider: 'facebook',
                    options: {
                      redirectTo: buildAuthCallbackUrl({ redirectTarget, mode: 'login' }),
                    },
                  });
                  if (oauthError) throw oauthError;
                } catch (err: unknown) {
                  setError(mapAuthMessage(err));
                  setLoading(false);
                }
              }}
              disabled={!supabaseReady}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-violet-400/40 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#1877F2] text-[10px] font-bold text-white">f</span>
              <span>Facebook</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-slate-300 md:text-left">
          Don&apos;t have an account?{' '}
          <Link to={redirectTarget ? `/register?redirect=${encodeURIComponent(redirectTarget)}` : '/register'} className="font-bold text-fuchsia-300 hover:underline">
            Create one now
          </Link>
        </div>
      </div>
    </AuthShell>
  );
};

export const RegisterPage = () => {
  const supabaseReady = hasSupabaseBrowserEnv();
  const [searchParams] = useSearchParams();
  const redirectTarget = normalizeRedirectTarget(searchParams.get('redirect'));
  const authError = searchParams.get('auth_error');
  const roleParam = searchParams.get('role');
  const referralCode = searchParams.get('ref') || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [skipPassword, setSkipPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AccountRole | null>(null);
  
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [otpPin, setOtpPin] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const { isAuthenticated, isReady, user } = useUser();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timerId = window.setTimeout(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timerId);
  }, [resendCooldown]);

  useEffect(() => {
    if (roleParam === 'customer' || roleParam === 'seller' || roleParam === 'reseller') {
      setRole(roleParam);
    }
  }, [roleParam]);

  useEffect(() => {
    if (authError) {
      return;
    }

    if (!isReady || !isAuthenticated || !user) {
      return;
    }

    navigate(resolvePostAuthDestination(user.role, redirectTarget), { replace: true });
  }, [authError, isAuthenticated, isReady, navigate, redirectTarget, user]);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!supabaseReady) {
      setError('Supabase authentication is not configured for this environment yet.');
      return;
    }

    if (!skipPassword && password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    if (!role) {
      setError('Choose your account type before continuing.');
      return;
    }

    const normalizedPhone = String(phone || '').replace(/[^0-9+]/g, '');
    if (!normalizedPhone || !bdPhoneRegex.test(normalizedPhone)) {
      setError('Enter a valid Bangladesh phone number (e.g. +8801712345678).');
      return;
    }

    setLoading(true);

    try {
      const registerPayloadBody: Record<string, unknown> = {
        email,
        phone,
        name,
        role,
        referralCode,
        redirectTo: redirectTarget
          ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTarget)}`
          : `${window.location.origin}/login`,
      };

      if (!skipPassword) {
        registerPayloadBody.password = password;
      }

      const registerResponse = await fetch('/api/auth/supabase/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerPayloadBody),
      });
      const registerPayload = await registerResponse.json().catch(() => null);

      if (!registerResponse.ok) {
        throw new Error(
          mapAuthMessage(registerPayload?.error || registerPayload || 'Unable to create your account right now.'),
        );
      }

      if (registerPayload?.requiresVerification) {
        setNeedsOtp(true);
        if (registerPayload?.resumingAccount) {
          setMessage(
            'An account with this email and phone already existed but was never verified. We resumed it and sent a fresh code to verify it now.'
          );
          toast.success('Existing account resumed. Verify to continue.');
        } else {
          setMessage('A verification code was sent to your email. Enter it below to activate your account.');
          toast.success('Account created. Verify your code to continue.');
        }
        return;
      }

      toast.success('Account created. Please verify your email to continue.');
      setMessage(
        `Your account was created. Please verify your email from your inbox, then sign in to continue${redirectTarget ? ` to ${redirectTarget}` : ''}.`,
      );
      return;
    } catch (err: unknown) {
      const normalizedMessage = mapAuthMessage(err);

      setError(
        normalizedMessage === 'Authentication could not be completed right now.'
          ? 'We could not create your account right now. Please try again in a moment.'
          : normalizedMessage,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerify = async (pinOverride?: string) => {
    const pin = (pinOverride ?? otpPin).trim();
    setError('');
    if (!pin || pin.length < 6) {
      setError('Enter the full 6-digit OTP.');
      return;
    }

    setOtpLoading(true);
    try {
      await verifyOtpCode({ identifier: email, purpose: 'register', pin });

      toast.success(
        skipPassword ? 'Email verified. Set a password to sign in.' : 'Email verified.',
      );
      const loginQuery = new URLSearchParams();
      if (redirectTarget) loginQuery.set('redirect', redirectTarget);
      if (skipPassword) loginQuery.set('notice', 'set_password');
      navigate(`/login${loginQuery.size ? `?${loginQuery.toString()}` : ''}`, { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'INVALID' || code === 'EXPIRED' || code === 'MAX_ATTEMPTS') {
        setOtpPin('');
      }
      setError(mapAuthMessage(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpResend = async () => {
    setError('');
    setOtpLoading(true);
    try {
      const result = await resendOtpCode({ identifier: email, purpose: 'register' });
      const seconds = typeof result?.resendInSeconds === 'number' ? result.resendInSeconds : 60;
      setResendCooldown(seconds);
      setMessage('A new verification code was sent to your email.');
    } catch (err: unknown) {
      setError(mapAuthMessage(err));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <AuthShell
      title="Join LofiMart your way"
      subtitle="Create one secure account, choose your role, and start shopping, selling, or reselling with the right tools from day one."
      highlights={registerHighlights}
      asideTitle="New accounts are ready for"
    >
      <div className="space-y-7">
        <div className="space-y-4 text-center md:text-left">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/30 md:mx-0">
            <User size={26} strokeWidth={2.2} />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <BadgeCheck size={14} />
                Verified account
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                <Sparkles size={14} />
                Role based
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-normal text-white font-display md:text-4xl">Create account</h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-slate-300 md:mx-0">
              Pick the account type that matches your goal. We will open the right dashboard after signup.
            </p>
          </div>

          {redirectTarget && (
            <div className="inline-flex max-w-full rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-slate-300">
              <span className="truncate">After setup: </span>
              <span className="ml-1 truncate font-semibold text-white">{redirectTarget}</span>
            </div>
          )}
        </div>

        {!supabaseReady && (
          <AuthAlert tone="warning">
            Supabase auth is not configured. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to your `.env`.
          </AuthAlert>
        )}
        {error && <AuthAlert tone="error">{error}</AuthAlert>}
        {message && <AuthAlert tone="success">{message}</AuthAlert>}

        {needsOtp ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Verify your account</p>
              <p className="text-sm leading-6 text-slate-400">
                We sent a 6-digit verification code to {email}. The code expires in 5 minutes.
              </p>
            </div>

            <OtpInput
              value={otpPin}
              onChange={setOtpPin}
              autoFocus={false}
              ariaLabel="Registration verification code"
              onComplete={(next) => {
                if (next.length === 6) {
                  setOtpPin(next);
                  void handleOtpVerify(next);
                }
              }}
            />

            <button
              type="button"
              onClick={() => void handleOtpVerify()}
              disabled={otpLoading || otpPin.length < 6}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
            >
              {otpLoading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Verify</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Didn&apos;t receive it?</span>
              <button
                type="button"
                onClick={handleOtpResend}
                disabled={otpLoading || resendCooldown > 0}
                className="font-semibold text-fuchsia-300 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>
        ) : (
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <InputField
              icon={<User size={18} />}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
            <InputField
              icon={<Mail size={18} />}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
            />
            <InputField
              icon={<User size={18} />}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+880 1712-345678"
              autoComplete="tel"
            />
            {skipPassword ? (
              <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100">
                <p>
                  You can verify your account with a code during signup, then set a password from your profile anytime.{' '}
                  <span className="font-semibold">Set a password now</span> for easier sign-in later.
                </p>
                <button
                  type="button"
                  onClick={() => setSkipPassword(false)}
                  className="mt-2 font-semibold text-fuchsia-300 hover:underline"
                >
                  Set a password now instead
                </button>
              </div>
            ) : (
              <>
                <InputField
                  icon={<Lock size={18} />}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create password"
                  autoComplete="new-password"
                >
                  <PasswordVisibilityButton
                    visible={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                    label={showPassword ? 'Hide password' : 'Show password'}
                  />
                </InputField>
                <div className="space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full transition-all ${strength.tone} ${strength.width}`} />
                  </div>
                  <p className="text-xs text-slate-400">{strength.label}. Use uppercase, numbers, and symbols for stronger protection.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSkipPassword(true)}
                  className="text-xs font-semibold text-slate-400 transition hover:text-slate-200"
                >
                  Skip for now - verify with a code instead
                </button>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-white">Choose account type</p>
              <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-300">Required</span>
            </div>
            <div className="grid gap-3">
              {(Object.keys(roleConfig) as AccountRole[]).map((item) => {
                const config = roleConfig[item];
                const active = role === item;

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRole(item)}
                    className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 ${
                      active
                        ? 'border-violet-400/50 bg-violet-500/15 shadow-md shadow-violet-950/30'
                        : 'border-white/10 bg-white/[0.04] hover:border-violet-400/40 hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <span
                        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-2xl bg-gradient-to-br ${config.accent} text-white ring-1 ring-white/10`}
                      >
                        {config.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <p className="leading-none font-semibold text-white">{config.title}</p>
                          {active && (
                            <span className="inline-flex w-fit items-center rounded-full bg-fuchsia-400/15 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-200">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-400">{config.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {referralCode && (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Referral applied: <span className="font-semibold">{referralCode}</span>
            </div>
          )}

          

          <button
            type="submit"
            disabled={loading || !supabaseReady}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>

          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-[#111126] px-3 text-slate-400">or sign up with</span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={async () => {
                  setError('');
                  setMessage('');
                  setLoading(true);
                  try {
                    if (!supabaseReady) {
                      throw new Error('Google signup is unavailable until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are configured.');
                    }
                    if (!role) {
                      throw new Error('Select your account type before continuing with Google.');
                    }
                    rememberPendingOAuthRedirect({ redirectTarget, role, referralCode, mode: 'register' });
                    const supabase = await getSupabaseBrowserClient();
                    const { error: oauthError } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: buildAuthCallbackUrl({ redirectTarget, role, referralCode, mode: 'register' }),
                        queryParams: {
                          access_type: 'offline',
                          prompt: 'select_account',
                        },
                      },
                    });
                    if (oauthError) throw oauthError;
                  } catch (err: unknown) {
                    setError(mapAuthMessage(err));
                    setLoading(false);
                  }
                }}
                disabled={loading || !supabaseReady}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-violet-400/40 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="shrink-0 animate-spin" size={18} /> : <GoogleGIcon />}
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  setError('');
                  setMessage('');
                  setLoading(true);
                  try {
                    if (!supabaseReady) {
                      throw new Error('Facebook signup is unavailable until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are configured.');
                    }
                    if (!role) {
                      throw new Error('Select your account type before continuing with Facebook.');
                    }
                    rememberPendingOAuthRedirect({ redirectTarget, role, referralCode, mode: 'register' });
                    const supabase = await getSupabaseBrowserClient();
                    const { error: oauthError } = await supabase.auth.signInWithOAuth({
                      provider: 'facebook',
                      options: {
                        redirectTo: buildAuthCallbackUrl({ redirectTarget, role, referralCode, mode: 'register' }),
                      },
                    });
                    if (oauthError) throw oauthError;
                  } catch (err: unknown) {
                    setError(mapAuthMessage(err));
                    setLoading(false);
                  }
                }}
                disabled={loading || !supabaseReady}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-violet-400/40 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="shrink-0 animate-spin" size={18} />
                ) : (
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#1877F2] text-[10px] font-bold text-white">f</span>
                )}
                <span>Facebook</span>
              </button>
            </div>
          </div>
        </form>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-slate-300 md:text-left">
          Already have an account?{' '}
          <Link to={redirectTarget ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : '/login'} className="font-bold text-fuchsia-300 hover:underline">
            Sign in
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          By continuing, you agree to our <Link to="/terms" className="font-semibold text-fuchsia-300 hover:underline">Terms of Service</Link> and{' '}
          <Link to="/privacy" className="font-semibold text-fuchsia-300 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </AuthShell>
  );
};
