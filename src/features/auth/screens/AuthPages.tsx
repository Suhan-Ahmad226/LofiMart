import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../../../lib/navigation';
import toast from 'react-hot-toast';
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
import { AuthAlert, AuthShell, InputField, PasswordVisibilityButton } from '../../../components/auth/AuthUI';
import {
  buildAuthCallbackUrl,
  exchangeSupabaseSession,
  getSupabaseBrowserClient,
  getPasswordStrength,
  hasSupabaseBrowserEnv,
  mapAuthMessage,
  normalizeRedirectTarget,
  rememberPendingOAuthRedirect,
  resolvePostAuthDestination,
  type AccountRole,
} from '../../../lib/auth-ui';

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
  const queryError = searchParams.get('error');
  const queryNotice = searchParams.get('notice');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, isAuthenticated, isReady, user } = useUser();

  useEffect(() => {
    if (!isReady || !isAuthenticated || !user) {
      return;
    }

    navigate(resolvePostAuthDestination(user.role, redirectTarget), { replace: true });
  }, [isAuthenticated, isReady, navigate, redirectTarget, user]);

  useEffect(() => {
    if (queryError) {
      setError(mapAuthMessage(queryError));
    }
    if (queryNotice === 'logged_out') {
      toast.success('You have been signed out successfully.');
    }
  }, [queryError, queryNotice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);

    if (!supabaseReady) {
      setError('Supabase authentication is not configured for this environment yet.');
      return;
    }

    setLoading(true);

    try {
      const supabase = await getSupabaseBrowserClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        throw new Error(signInError.message || 'Login failed');
      }

      const sessionToken = signInData.session?.access_token;
      if (!sessionToken) {
        throw new Error('Supabase session was not created');
      }

      const data = await exchangeSupabaseSession({ accessToken: sessionToken });
      login(data.user, data.token, data.refreshToken);
      toast.success(`Welcome back${data.user?.name ? `, ${data.user.name}` : ''}.`);
      navigate(resolvePostAuthDestination(data.user.role, redirectTarget), { replace: true });
    } catch (err: any) {
      const message = mapAuthMessage(err?.message ?? err ?? 'Unable to sign in right now.');
      if (String(message).toLowerCase().includes('verify')) {
        setNeedsVerification(true);
      }
      setError(message);
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
        <div className="space-y-4 text-center sm:text-left">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/30 sm:mx-0">
            <Fingerprint size={26} strokeWidth={2.2} />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <BadgeCheck size={14} />
                Secure login
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                <Clock3 size={14} />
                Fast access
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-normal text-white font-display sm:text-4xl">Sign in</h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-slate-300 sm:mx-0">
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
        {needsVerification && (
          <AuthAlert tone="warning">
            Please verify your email first. Check your inbox for the verification link, then sign in again.
          </AuthAlert>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <InputField
              icon={<Mail size={18} />}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
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

          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-400">Protected session for every device.</p>
            <Link to="/forgot-password" className="font-semibold text-fuchsia-300 transition hover:text-fuchsia-200">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading || !supabaseReady}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
          >
            {loading ? (
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

        <div className="space-y-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-[#111126] px-3 text-slate-400">or continue with</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
                } catch (err: any) {
                  setError(mapAuthMessage(err?.message || err || 'Google sign-in failed'));
                  setLoading(false);
                }
              }}
              disabled={!supabaseReady}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-violet-400/40 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <img src="https://www.google.com/favicon.ico" className="h-4 w-4" alt="Google" />
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
                } catch (err: any) {
                  setError(mapAuthMessage(err?.message || err || 'Facebook sign-in failed'));
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

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-slate-300 sm:text-left">
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
  const roleParam = searchParams.get('role');
  const referralCode = searchParams.get('ref') || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, isAuthenticated, isReady, user } = useUser();

  useEffect(() => {
    if (roleParam === 'customer' || roleParam === 'seller' || roleParam === 'reseller') {
      setRole(roleParam);
    }
  }, [roleParam]);

  useEffect(() => {
    if (!isReady || !isAuthenticated || !user) {
      return;
    }

    navigate(resolvePostAuthDestination(user.role, redirectTarget), { replace: true });
  }, [isAuthenticated, isReady, navigate, redirectTarget, user]);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!supabaseReady) {
      setError('Supabase authentication is not configured for this environment yet.');
      return;
    }

    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!role) {
      setError('Please choose whether you are registering as a customer, seller, or reseller.');
      return;
    }

    if (!acceptedTerms) {
      setError('Please accept the terms and privacy policy to continue.');
      return;
    }

    setLoading(true);

    const registerStage: 'server-register' | null = 'server-register';

    try {
      const registerResponse = await fetch('/api/auth/supabase/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          role,
          name,
          referralCode,
          redirectTo: redirectTarget
            ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTarget)}`
            : `${window.location.origin}/login`,
        }),
      });
      const registerPayload = await registerResponse.json().catch(() => null);

      if (!registerResponse.ok) {
        throw new Error(
          mapAuthMessage(registerPayload?.error || registerPayload || 'Unable to create your account right now.'),
        );
      }

      if (registerPayload?.token && registerPayload?.user) {
        login(registerPayload.user, registerPayload.token, registerPayload.refreshToken);
        toast.success(`Welcome${registerPayload.user?.name ? `, ${registerPayload.user.name}` : ''}. Your account is ready.`);
        navigate(resolvePostAuthDestination(registerPayload.user.role, redirectTarget), { replace: true });
        return;
      }

      toast.success('Account created. Please verify your email to continue.');
      setMessage(
        `Your ${role} account was created. Please verify your email from your inbox, then sign in to continue${redirectTarget ? ` to ${redirectTarget}` : ''}.`,
      );
      return;
    } catch (err: any) {
      const normalizedMessage = mapAuthMessage(err?.message ?? err);

      if (
        normalizedMessage &&
        normalizedMessage !== 'Authentication could not be completed right now.'
      ) {
        setError(normalizedMessage);
        return;
      }

      if (registerStage === 'server-register') {
        setError('We could not create your account right now. Please try again in a moment.');
        return;
      }

      setError('Unable to create your account right now.');
    } finally {
      setLoading(false);
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
        <div className="space-y-4 text-center sm:text-left">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500 text-white shadow-lg shadow-violet-500/30 sm:mx-0">
            <User size={26} strokeWidth={2.2} />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                <BadgeCheck size={14} />
                Verified account
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-100">
                <Sparkles size={14} />
                Role based
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-normal text-white font-display sm:text-4xl">Create account</h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-slate-300 sm:mx-0">
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
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <div className="space-y-3">
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
              </div>
              <InputField
                icon={<Lock size={18} />}
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              >
                <PasswordVisibilityButton
                  visible={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                />
              </InputField>
            </div>
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
                    <div className="flex items-center gap-3 sm:gap-4">
                      <span
                        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-2xl bg-gradient-to-br ${config.accent} text-white ring-1 ring-white/10`}
                      >
                        {config.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
            <span className="font-semibold text-white">After signup:</span> verify your email, then we will route you to the correct dashboard for your selected role.
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 rounded border-white/20 bg-white/10 text-violet-500 focus:ring-violet-400"
            />
            <span>
              I agree to the <Link to="/terms" className="font-semibold text-fuchsia-300 hover:underline">Terms</Link> and{' '}
              <Link to="/privacy" className="font-semibold text-fuchsia-300 hover:underline">Privacy Policy</Link>.
            </span>
          </label>

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

            <div className="grid gap-3 sm:grid-cols-2">
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
                    if (!acceptedTerms) {
                      throw new Error('Please accept the terms and privacy policy before continuing with Google.');
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
                  } catch (err: any) {
                    setError(mapAuthMessage(err?.message || err || 'Google sign-up failed'));
                    setLoading(false);
                  }
                }}
                disabled={loading || !supabaseReady}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-violet-400/40 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="shrink-0 animate-spin" size={18} /> : <img src="https://www.google.com/favicon.ico" className="h-4 w-4 shrink-0" alt="Google" />}
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
                    if (!acceptedTerms) {
                      throw new Error('Please accept the terms and privacy policy before continuing with Facebook.');
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
                  } catch (err: any) {
                    setError(mapAuthMessage(err?.message || err || 'Facebook sign-up failed'));
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

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm text-slate-300 sm:text-left">
          Already have an account?{' '}
          <Link to={redirectTarget ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : '/login'} className="font-bold text-fuchsia-300 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </AuthShell>
  );
};
