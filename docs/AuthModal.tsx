'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  Facebook,
  Info,
  Loader2,
  Lock,
  LockKeyhole,
  Mail,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthModal, type AuthView } from '@/features/auth/context/AuthModalContext';
import OtpInput, { OtpStatusLine, type OtpStatus } from '@/features/auth/components/OtpInput';
import {
  adoptAuthSession,
  buildAuthCallbackUrl,
  getPasswordRuleState,
  getPasswordStrength,
  getSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
  isPasswordValid,
  loginWithPassword,
  mapAuthMessage,
  rememberPendingOAuthRedirect,
  requestEmailVerification,
  requestPasswordReset,
  resendOtpCode,
  resetPasswordWithOtp,
  resolvePostAuthDestination,
  verifyOtpCode,
} from '@/lib/auth-ui';
import { useUser } from '@/features/shared/state/UserContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

function maskEmail(value: string) {
  const [name, domain] = value.split('@');
  if (!domain) return value;
  return `${name.slice(0, 1)}***@${domain}`;
}

/**
 * Read the resend cooldown the server reported. The countdown is only a
 * display mirror of it, so an explicit value is always honoured as-is.
 */
function readCooldownSeconds(data: unknown, fallback = 60) {
  const seconds = Number((data as { resendInSeconds?: unknown } | null)?.resendInSeconds);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : fallback;
}

/**
 * Interactive rows that read as plain text but still need a full 44px touch
 * target on phones.
 */
const TAP_TARGET = 'inline-flex min-h-11 items-center justify-center py-2';

/**
 * Secondary inline link (label row actions, view switches). The negative
 * margin keeps the compact look of the design while the 44px target stays.
 */
const TAP_INLINE = '-my-2 inline-flex min-h-11 items-center px-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#3525cd] transition-colors hover:underline';

const IDENTITY_AUTOCOMPLETE = {
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

/**
 * Type scale from the design spec: headline 24/32 bold, label-lg 14/20
 * semibold, label-md 12/16 semibold, label-sm 10/12 bold.
 */
const HEADING = 'text-[24px] font-bold leading-8 tracking-[-0.02em] text-[#131b2e]';
const BODY = 'text-[14px] leading-5 text-[#464555]';
const LABEL = 'text-[12px] font-semibold leading-4 tracking-[0.02em] text-[#131b2e]';
const LABEL_SM = 'text-[10px] font-bold uppercase leading-3 tracking-[0.04em]';
const INPUT = 'h-12 w-full rounded-xl bg-[#f2f3ff] px-3.5 text-[14px] leading-5 text-[#131b2e] outline-none transition-colors placeholder:text-[#777587] hover:bg-[#eaedff] focus:bg-white focus:shadow-[0_1px_3px_rgba(19,27,46,0.14)] disabled:cursor-not-allowed disabled:opacity-60';

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
  right,
  inputMode,
  disabled = false,
  autoFocus = false,
  identity = false,
  name,
  labelRight,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  right?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  disabled?: boolean;
  autoFocus?: boolean;
  /** Email/phone style input: no autocapitalise, autocorrect or spellcheck. */
  identity?: boolean;
  name?: string;
  /** Trailing action rendered on the label row, e.g. "Forgot password?". */
  labelRight?: React.ReactNode;
}) {
  const fieldId = React.useId();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={fieldId} className={LABEL}>
          {label}
        </label>
        {labelRight}
      </div>
      <div className="relative">
        <input
          id={fieldId}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          disabled={disabled}
          autoFocus={autoFocus}
          data-autofocus={autoFocus ? 'true' : undefined}
          {...(identity ? IDENTITY_AUTOCOMPLETE : {})}
          className={INPUT}
        />
        {right}
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled = false,
  autoFocus = false,
  name,
  labelRight,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
  labelRight?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      label={label}
      labelRight={labelRight}
      name={name}
      value={value}
      onChange={onChange}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder={disabled ? 'Verify email first' : '••••••••'}
      right={
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#464555] transition-colors hover:text-[#131b2e]"
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      }
    />
  );
}

/**
 * Material-style strength meter plus the live rule checklist, so the user can
 * see exactly what the auth API will accept before submitting.
 */
function PasswordChecklist({ password, withMeter = false }: { password: string; withMeter?: boolean }) {
  const strength = getPasswordStrength(password);

  return (
    <div className="mt-3 rounded-xl bg-[#f2f3ff] p-3">
      {withMeter && (
        <div aria-hidden="true" className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#dae2fd]">
          <div className={`h-full rounded-full transition-all duration-300 ${strength.tone} ${strength.width}`} />
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {getPasswordRuleState(password).map((rule) => (
          <li
            key={rule.id}
            className={`flex items-center gap-2 text-[12px] leading-4 tracking-[0.01em] ${rule.met ? 'text-[#131b2e]' : 'text-[#464555]'}`}
          >
            {rule.met ? (
              <CheckCircle2 size={16} className="shrink-0 text-[#006c49]" />
            ) : (
              <Circle size={16} className="shrink-0 text-[#777587]" />
            )}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Cooldown mirror plus the manual resend action. The server owns the real
 * cooldown, so the button stays tappable while the timer only informs.
 */
function ResendRow({
  secondsLeft,
  loading,
  onResend,
}: {
  secondsLeft: number;
  loading: boolean;
  onResend: () => void;
}) {
  return (
    <>
      {secondsLeft > 0 ? (
        <p className="mt-2 text-center text-[12px] leading-4 tracking-[0.01em] text-[#464555]">
          Resend code in <span className={`${LABEL} text-[#3525cd]`}>{secondsLeft}s</span>
        </p>
      ) : null}

      <div className="mt-1 flex flex-col items-center gap-0.5">
        <span className="text-[12px] leading-4 tracking-[0.01em] text-[#464555]">Didn&apos;t receive it?</span>
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className={`${TAP_INLINE} text-[12px] font-semibold normal-case tracking-[0.02em] hover:underline disabled:opacity-50`}
        >
          <RefreshCw size={14} className="shrink-0" />
          Resend code
        </button>
      </div>


    </>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18V16.94A11 11 0 0 0 12 23Z" />
      <path fill="#fbbc05" d="M5.84 14.09A6.94 6.94 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.06H2.18A10.99 10.99 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.85Z" />
      <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1c-4.3 0-8.01 2.47-9.82 6.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

type OtpFlow = 'register' | 'login-verify' | 'reset';

const OTP_PURPOSE_BY_FLOW: Record<OtpFlow, string> = {
  register: 'register',
  'login-verify': 'verify_email',
  reset: 'reset_password',
};

export default function AuthModal() {
  const { isOpen, view, returnTo, closeAuth, setView, openAuth } = useAuthModal();
  const { login, user, setUser, token } = useUser();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [otpStatus, setOtpStatus] = useState<OtpStatus>('idle');
  const [emailVerified, setEmailVerified] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [otpFlow, setOtpFlow] = useState<OtpFlow>('register');
  const [pendingLoginPassword, setPendingLoginPassword] = useState('');

  const destination = useMemo(() => {
    const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/account/dashboard';
    return target.startsWith('/login') || target.startsWith('/register') ? '/account/dashboard' : target;
  }, [returnTo]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = new URL(window.location.href);
    if (current.searchParams.get('auth_success') !== '1') return;
    current.searchParams.delete('auth_success');
    const cleanPath = current.pathname + (current.search ? current.search : '');
    openAuth({ view: 'success', returnTo: cleanPath });
    window.history.replaceState({}, '', cleanPath);
  }, [openAuth]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setNotice('');
    setLoading(false);
    setOtp('');
    setOtpStatus('idle');
    setPassword('');
    setConfirm('');
    // A taller step must never inherit the previous step's scroll offset.
    const scroller = scrollRef.current;
    if (scroller) {
      if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0 });
      else scroller.scrollTop = 0;
    }
  }, [isOpen, view]);

  // Email verification is proven by the server-issued session, so the flag is
  // only cleared when the dialog closes or the user steps back to a screen
  // that runs before the password step.
  useEffect(() => {
    if (isOpen && view === 'signup-password') return;
    setEmailVerified(false);
  }, [isOpen, view]);

  // The countdown below is display-only convenience. The auth API is the
  // authority for the resend cooldown and rejects early resends regardless.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  // Keep the page behind the dialog still on mobile.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) closeAuth();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, closeAuth]);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );

    // Prefer the active step's autofocus target. Without this, moving from
    // email to password focuses the header's Back button instead, because
    // the trap runs after the newly-rendered field mounts.
    const autofocusTarget = dialog.querySelector<HTMLElement>('[data-autofocus="true"]:not([disabled])');
    (autofocusTarget ?? focusable()[0])?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [isOpen, view]);

  const goBack = () => {
    setError('');
    setNotice('');

    if (view === 'entry') return closeAuth();
    if (view === 'login-password' || view === 'signup-start' || view === 'forgot-password') return setView('entry');
    if (view === 'signup-otp') return setView(otpFlow === 'reset' ? 'forgot-password' : otpFlow === 'login-verify' ? 'login-password' : 'signup-start');
    if (view === 'signup-password') return setView('signup-otp');
    if (view === 'reset-otp') return setView('forgot-password');
    if (view === 'reset-password') return setView('reset-otp');
    if (view === 'reset-success') return setView('login-password');
    return setView('entry');
  };

  const finishLogin = (result: { user: any; accessToken?: string }) => {
    login(result.user, result.accessToken);
    closeAuth();
    router.replace(resolvePostAuthDestination(result.user.role, destination));
  };

  const continueIdentifier = () => {
    const value = identifier.trim();

    if (!value) {
      setError('Enter your email or phone number.');
      return;
    }

    setError('');
    setIdentifier(value);
    setEmail(value.includes('@') ? value.toLowerCase() : '');
    setView('login-password');
  };

  const sendSignupOtp = async (target = email) => {
    const clean = target.trim().toLowerCase();

    if (!EMAIL_RE.test(clean)) {
      setError('Enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/auth/pre-register-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: clean }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(data?.error || 'Unable to send verification code.');

      setEmail(clean);
      setOtpFlow('register');
      setOtp('');
      setOtpStatus('idle');
      setView('signup-otp');
      setResendIn(readCooldownSeconds(data));
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resend for an already-issued code. The cooldown lives on the server, so
   * the button simply reflects whatever the API allows.
   */
  const resendOtp = async () => {
    const purpose = OTP_PURPOSE_BY_FLOW[otpFlow];
    const target = otpFlow === 'reset' ? resetIdentifier : email;

    setLoading(true);
    setError('');

    try {
      const data = await resendOtpCode({ identifier: target, purpose });
      setOtp('');
      setOtpStatus('idle');
      setResendIn(readCooldownSeconds(data));
      setNotice(
        otpFlow === 'reset'
          ? 'If an account exists, a verification code has been sent.'
          : `Verification code sent to ${maskEmail(target)}.`,
      );
    } catch (requestError) {
      const details = requestError as { retryAfterSeconds?: number };
      if (details.retryAfterSeconds) setResendIn(details.retryAfterSeconds);
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async () => {
    if (!emailVerified) {
      setError('Verify your email first.');
      return;
    }

    if (!isPasswordValid(password)) {
      setError('Password must be at least 8 characters and include a number.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = await getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) throw new Error('Your verification session expired. Please start again.');

      const response = await fetch('/api/auth/complete-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: email.split('@')[0],
          email,
          password,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(data?.error || 'Registration failed.');

      if (data?.user) login(data.user, accessToken);
      setNotice('Your account is ready.');
      setView('success');
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const doPasswordLogin = async () => {
    if (!identifier.trim() || !password) {
      setError('Email or phone number and password are required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await loginWithPassword({
        identifier,
        password,
        redirectTarget: destination,
      });
      finishLogin(result);
    } catch (requestError) {
      const details = requestError as { code?: string; identifier?: string };

      if (details.code === 'EMAIL_NOT_VERIFIED') {
        const pendingEmail = details.identifier || identifier.trim();

        setEmail(pendingEmail);
        setOtpFlow('login-verify');
        setPendingLoginPassword(password);
        setOtp('');
        setResendIn(60);
        setView('signup-otp');

        try {
          await requestEmailVerification({ identifier: pendingEmail });
          setNotice(`Verification code sent to ${maskEmail(pendingEmail)}.`);
        } catch (sendError) {
          setError(mapAuthMessage(sendError));
        }
      } else {
        setError(mapAuthMessage(requestError));
      }
    } finally {
      setLoading(false);
    }
  };

  const verifySignupOtp = async (code: string) => {
    if (code.length !== OTP_LENGTH || loading) return;

    setLoading(true);
    setOtpStatus('verifying');
    setError('');
    setNotice('');

    try {
      if (otpFlow === 'login-verify') {
        await verifyOtpCode({ identifier: email, purpose: 'verify_email', pin: code });
        setOtp(code);
        setOtpStatus('success');
        const result = await loginWithPassword({
          identifier,
          password: pendingLoginPassword,
          redirectTarget: destination,
        });
        finishLogin(result);
        return;
      }

      // Registration codes are verified on the server so the attempt budget
      // lives next to the OTP store instead of in the browser. The server
      // returns the freshly minted Supabase session, which the browser then
      // adopts to finish account creation.
      const data = await verifyOtpCode({ identifier: email, purpose: 'register', pin: code });
      await adoptAuthSession(data?.session);

      setOtp(code);
      setOtpStatus('success');
      setEmailVerified(true);
      setView('signup-password');
    } catch (requestError) {
      setOtp('');
      setOtpStatus('error');
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const startForgot = async () => {
    const value = resetIdentifier.trim();

    if (!value) {
      setError('Enter your email or phone number.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const data = await requestPasswordReset({ identifier: value });
      setResendIn(readCooldownSeconds(data));
      setOtpFlow('reset');
      setOtp('');
      setOtpStatus('idle');
      setView('reset-otp');
      setNotice('If an account exists, a verification code has been sent.');
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const verifyResetOtp = async (code: string) => {
    if (code.length !== OTP_LENGTH || loading) return;

    setLoading(true);
    setOtpStatus('verifying');
    setError('');

    try {
      await verifyOtpCode({ identifier: resetIdentifier, purpose: 'reset_password', pin: code });
      setOtp(code);
      setOtpStatus('success');
      setView('reset-password');
    } catch (requestError) {
      setOtp('');
      setOtpStatus('error');
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const doReset = async () => {
    if (!isPasswordValid(password)) {
      setError('Password must be at least 8 characters and include a number.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await resetPasswordWithOtp({
        identifier: resetIdentifier,
        newPassword: password,
      });
      setView('reset-success');
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const startOnboarding = async (kind: 'seller' | 'reseller') => {
    if (!token || !user) {
      setError('Please sign in again before starting onboarding.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(kind === 'seller' ? '/api/account/become-seller' : '/api/account/become-reseller', {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to start onboarding.');
      }

      setUser({
        ...user,
        role: data.user?.role || kind,
        seller_status: data.user?.sellerStatus || (kind === 'seller' ? 'draft' : 'approved'),
      });

      closeAuth();
      router.push(kind === 'seller' ? '/seller/onboarding' : '/reseller-dashboard/onboarding');
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const social = async (provider: 'google' | 'facebook') => {
    setLoading(true);
    setError('');

    try {
      if (!hasSupabaseBrowserEnv()) throw new Error('Supabase auth is not configured.');

      const supabase = await getSupabaseBrowserClient();
      rememberPendingOAuthRedirect({ redirectTarget: destination, mode: 'register' });

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: buildAuthCallbackUrl({ redirectTarget: destination, mode: 'register' }),
        },
      });

      if (oauthError) throw oauthError;
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const title: Record<AuthView, string> = {
    entry: 'Welcome to LofiMart 👋',
    'login-password': 'Welcome back 👋',
    'signup-start': 'Create your account 👋',
    'signup-otp': 'Verify your email ✉️',
    'signup-password': 'Create your password',
    'forgot-password': 'Forgot password?',
    'reset-otp': 'Verify your identity',
    'reset-password': 'Reset password',
    success: 'Welcome to LofiMart 👋',
    'reset-success': 'Password updated',
  };

  const subtitle: Record<AuthView, string> = {
    entry: 'Sign in or create an account.',
    'login-password': 'Enter your password to sign in',
    'signup-start': 'We will send a verification code to your email.',
    'signup-otp': `Enter the 6-digit code we sent to ${maskEmail(email)}.`,
    'signup-password': 'Protect your purchases and cart',
    'forgot-password': 'We will help you reset your password.',
    'reset-otp': `Enter the 6-digit code we sent to ${maskEmail(resetIdentifier)}.`,
    'reset-password': 'Choose a new password for your account.',
    success: 'Your account is ready.',
    'reset-success': 'Your new password is ready.',
  };

  const content = (
    <>
      {view === 'entry' && (
  <form
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      void continueIdentifier();
    }}
    className="w-full"
  >
    {/* Social Login */}
    <div className="flex w-full flex-col gap-3">
      <button
        type="button"
        onClick={() => void social('google')}
        disabled={loading}
        className="
          flex h-12 w-full items-center justify-center gap-3
          rounded-xl border border-[#dfe3ef]
          bg-white px-4
          text-[14px] font-semibold text-[#20212b]
          shadow-[0_1px_3px_rgba(16,24,40,0.05)]
          transition-all duration-200
          hover:border-[#cbd2e5]
          hover:bg-[#fafbff]
          hover:shadow-[0_4px_12px_rgba(16,24,40,0.06)]
          active:scale-[0.99]
          disabled:cursor-not-allowed
          disabled:opacity-60
          focus:outline-none
          focus-visible:ring-2
          focus-visible:ring-[#006c49]/25
          focus-visible:ring-offset-1
        "
      >
        <span className="flex shrink-0 items-center justify-center">
          <GoogleIcon />
        </span>

        <span>Continue with Google</span>
      </button>

      <button
        type="button"
        onClick={() => void social('facebook')}
        disabled={loading}
        className="
          flex h-12 w-full items-center justify-center gap-3
          rounded-xl border border-[#dfe3ef]
          bg-white px-4
          text-[14px] font-semibold text-[#20212b]
          shadow-[0_1px_3px_rgba(16,24,40,0.05)]
          transition-all duration-200
          hover:border-[#cbd2e5]
          hover:bg-[#fafbff]
          hover:shadow-[0_4px_12px_rgba(16,24,40,0.06)]
          active:scale-[0.99]
          disabled:cursor-not-allowed
          disabled:opacity-60
          focus:outline-none
          focus-visible:ring-2
          focus-visible:ring-[#006c49]/25
          focus-visible:ring-offset-1
        "
      >
        <span className="flex shrink-0 items-center justify-center">
          <Facebook
            size={18}
            fill="currentColor"
            aria-hidden="true"
          />
        </span>

        <span>Continue with Facebook</span>
      </button>
    </div>

    {/* Divider */}
    <div
      className="my-5 flex w-full items-center gap-3"
      role="separator"
    >
      <span
        aria-hidden="true"
        className="h-px flex-1 bg-[#e1e5ef]"
      />

      <span
        className="
          shrink-0 px-1
          text-[11px] font-semibold uppercase
          tracking-[0.12em] text-[#77798a]
        "
      >
        or
      </span>

      <span
        aria-hidden="true"
        className="h-px flex-1 bg-[#e1e5ef]"
      />
    </div>

    {/* Email Field */}
    <div className="w-full">
      <Field
        label="Email address"
        name="identifier"
        value={identifier}
        onChange={setIdentifier}
        autoComplete="email"
        placeholder="Enter your email address"
        inputMode="email"
        identity
      />
    </div>

    {/* Continue Button */}
    <button
      type="submit"
      disabled={loading || !identifier.trim()}
      className="
        mt-4 flex h-12 w-full
        items-center justify-center gap-2
        rounded-xl
        bg-[#006c49]
        px-5
        text-[14px] font-semibold
        text-white
        shadow-[0_4px_12px_rgba(0,108,73,0.18)]
        transition-all duration-200
        hover:bg-[#005b3d]
        hover:shadow-[0_6px_16px_rgba(0,108,73,0.22)]
        active:scale-[0.99]
        disabled:cursor-not-allowed
        disabled:bg-[#aeb8b3]
        disabled:text-white/80
        disabled:shadow-none
        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-[#006c49]/30
        focus-visible:ring-offset-2
      "
      aria-busy={loading}
    >
      {loading ? (
        <>
          <Loader2
            size={18}
            className="animate-spin"
            aria-hidden="true"
          />
          <span>Checking...</span>
        </>
      ) : (
        <>
          <span>Continue</span>

          <ArrowRight
            size={18}
            className="shrink-0"
            aria-hidden="true"
          />
        </>
      )}
    </button>

    {/* Security Notice */}
    <div className="mt-5 flex flex-col items-center text-center">
      <div className="flex items-center gap-1.5 text-[#464555]">
        <ShieldCheck
          size={15}
          className="shrink-0 text-[#006c49]"
          aria-hidden="true"
        />

        <span
          className="
            text-[11px] font-medium
            leading-4 tracking-[0.04em]
            text-[#5f6170]
          "
        >
          Secure authentication
        </span>
      </div>

      <p
        className="
          mt-2 max-w-[320px]
          text-[11px] leading-[17px]
          tracking-[0.01em]
          text-[#77798a]
        "
      >
        By continuing, you agree to LofiMart&apos;s{' '}
        <a
          href="/terms"
          className="
            font-medium text-[#006c49]
            underline-offset-2
            transition-colors
            hover:text-[#005b3d]
            hover:underline
            focus:outline-none
            focus-visible:underline
          "
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="/privacy"
          className="
            font-medium text-[#006c49]
            underline-offset-2
            transition-colors
            hover:text-[#005b3d]
            hover:underline
            focus:outline-none
            focus-visible:underline
          "
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  </form>
)}

      {view === 'login-password' && (
  <form
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      void doPasswordLogin();
    }}
    className="w-full"
  >
    {/* Account identity */}
    <div
      className="
        mb-5 flex w-full items-center justify-between gap-3
        rounded-xl
        border border-[#e1e5f0]
        bg-[#f7f8fc]
        px-3 py-2.5
      "
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="
            flex h-8 w-8 shrink-0 items-center justify-center
            rounded-full
            bg-[#e9e7ff]
            text-[12px] font-bold
            text-[#3525cd]
          "
        >
          {(email || identifier).charAt(0).toUpperCase()}
        </span>

        <span
          className="
            min-w-0 truncate
            text-[13px] font-medium
            leading-5 text-[#30313d]
          "
        >
          {email ? maskEmail(email) : identifier}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setView('entry')}
        className="
          flex h-9 shrink-0 items-center justify-center
          rounded-lg px-2.5
          text-[12px] font-semibold
          text-[#3525cd]
          transition-colors duration-150
          hover:bg-[#ecebff]
          hover:text-[#271bb0]
          focus:outline-none
          focus-visible:ring-2
          focus-visible:ring-[#3525cd]/25
        "
      >
        Edit
      </button>
    </div>

    {/* Password */}
    <PasswordField
      label="Password"
      name="password"
      value={password}
      onChange={setPassword}
      autoComplete="current-password"
      autoFocus
      labelRight={
        <button
          type="button"
          onClick={() => {
            setResetIdentifier(email || identifier);
            setView('forgot-password');
          }}
          className="
            rounded-md
            px-1 py-0.5
            text-[12px] font-semibold
            tracking-[0.01em]
            text-[#3525cd]
            transition-colors duration-150
            hover:text-[#271bb0]
            hover:underline
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-[#3525cd]/25
          "
        >
          Forgot password?
        </button>
      }
    />

    {/* Primary Login */}
    <button
      type="submit"
      disabled={loading || !password}
      className="
        mt-4 flex h-12 w-full
        items-center justify-center gap-2
        rounded-xl
        bg-[#006c49]
        px-5
        text-[14px] font-semibold
        text-white
        shadow-[0_4px_12px_rgba(0,108,73,0.18)]
        transition-all duration-200
        hover:bg-[#005b3d]
        hover:shadow-[0_6px_16px_rgba(0,108,73,0.22)]
        active:scale-[0.99]
        disabled:cursor-not-allowed
        disabled:bg-[#aeb8b3]
        disabled:shadow-none
        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-[#006c49]/30
        focus-visible:ring-offset-2
      "
      aria-busy={loading}
    >
      {loading ? (
        <>
          <Loader2
            size={18}
            className="animate-spin"
            aria-hidden="true"
          />
          <span>Signing in...</span>
        </>
      ) : (
        <>
          <span>Sign in</span>
          <ArrowRight
            size={18}
            className="shrink-0"
            aria-hidden="true"
          />
        </>
      )}
    </button>

    {/* Create account */}
    {email ? (
      <button
        type="button"
        onClick={() => {
          setError('');
          setView('signup-start');
        }}
        className="
          mt-3 flex min-h-10 w-full
          items-center justify-center gap-1.5
          rounded-lg
          px-3 py-2
          text-[12px] font-semibold
          leading-4 tracking-[0.01em]
          text-[#464555]
          transition-colors duration-150
          hover:bg-[#f5f6fa]
          hover:text-[#131b2e]
          focus:outline-none
          focus-visible:ring-2
          focus-visible:ring-[#006c49]/20
        "
      >
        <span>New to LofiMart?</span>

        <span className="text-[#006c49]">
          Create an account
        </span>
      </button>
    ) : (
      <p
        className="
          mt-3 px-3
          text-center
          text-[12px] leading-4
          text-[#646477]
        "
      >
        New accounts need an email address, so sign up from the email
        option.
      </p>
    )}

    {/* Switch account */}
    <button
      type="button"
      onClick={() => setView('entry')}
      className="
        mt-1 flex min-h-10 w-full
        items-center justify-center gap-2
        rounded-lg
        px-3 py-2
        text-[12px] font-semibold
        leading-4 tracking-[0.01em]
        text-[#646477]
        transition-colors duration-150
        hover:bg-[#f7f8fc]
        hover:text-[#131b2e]
        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-[#006c49]/20
      "
    >
      <ArrowLeft
        size={15}
        className="shrink-0"
        aria-hidden="true"
      />

      <span>Use another account</span>
    </button>
  </form>
)}

      {view === 'signup-start' && (
        <>
          <div className="auth-account-badge flex items-center justify-between gap-2 rounded-xl px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Mail size={16} className="shrink-0 text-[#3525cd]" />
              <span className={`${LABEL} truncate`}>{maskEmail(email)}</span>
            </div>
            <button type="button" onClick={() => setView('login-password')} className={`${LABEL_SM} ml-2 flex-shrink-0 normal-case tracking-[0.04em] text-[#3525cd] hover:underline`}>
              Edit
            </button>
          </div>
          <button type="button" onClick={() => void sendSignupOtp()} disabled={loading} className="auth-primary mt-4">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <><span>Send verification code</span><Send size={18} /></>}
          </button>
        </>
      )}

      {view === 'signup-otp' && (
  <div className="w-full">
    {/* Heading / Description */}
    <div className="text-center">
      <p className="text-[14px] leading-5 text-[#464555]">
        We sent a 6-digit verification code to
      </p>

      <p
        className="
          mt-1 truncate
          text-[14px] font-semibold
          leading-5 text-[#131b2e]
        "
      >
        {maskEmail(email)}
      </p>
    </div>

    {/* OTP Input */}
    <div className="mt-6 flex w-full justify-center">
      <OtpInput
        value={otp}
        onChange={(next) => {
          setOtp(next);

          if (otpStatus !== 'verifying') {
            setOtpStatus('idle');
          }
        }}
        status={otpStatus}
        autoFocus
        disabled={loading}
        ariaLabel="6 digit email verification code"
        onComplete={(code) => void verifySignupOtp(code)}
      />
    </div>

    {/* Verification status */}
    <div
      className="
        mt-4 flex min-h-[22px]
        flex-col items-center justify-center
        gap-1
      "
      aria-live="polite"
    >
      <OtpStatusLine
        status={otpStatus}
        className="mt-0"
      />

      {notice ? (
        <p
          className="
            max-w-[320px]
            text-center
            text-[12px] leading-4
            text-[#646477]
          "
        >
          {notice}
        </p>
      ) : null}
    </div>

    {/* Resend */}
    <div className="mt-5 flex justify-center">
      <ResendRow
        secondsLeft={resendIn}
        loading={loading}
        onResend={() => void resendOtp()}
      />
    </div>

    {/* Help text */}
    <p
      className="
        mx-auto mt-4 max-w-[300px]
        text-center
        text-[11px] leading-[17px]
        text-[#77798a]
      "
    >
      Didn&apos;t receive the code? Check your spam folder or request a
      new code when the timer ends.
    </p>
  </div>
)}

     {view === 'signup-password' && (
  <form
    noValidate
    onSubmit={(event) => {
      event.preventDefault();
      void completeRegistration();
    }}
    className="w-full"
  >
    {/* Intro */}
    <div className="mb-5 text-center">
      <p className="text-[14px] leading-5 text-[#464555]">
        Your email has been verified.
      </p>

      <p
        className="
          mt-1 truncate
          text-[13px] font-medium
          leading-5 text-[#646477]
        "
      >
        {maskEmail(email)}
      </p>
    </div>

    {/* Password */}
    <div className="w-full">
      <PasswordField
        label="Create password"
        name="new-password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        disabled={!emailVerified || loading}
        autoFocus
      />
    </div>

    {/* Password requirements */}
    <div className="mt-3">
      <PasswordChecklist
        password={password}
        withMeter
      />
    </div>

    {/* Create account */}
    <button
      type="submit"
      disabled={
        loading ||
        !emailVerified ||
        !isPasswordValid(password)
      }
      className="
        mt-5 flex h-12 w-full
        items-center justify-center gap-2
        rounded-xl
        bg-[#006c49]
        px-5
        text-[14px] font-semibold
        text-white
        shadow-[0_4px_12px_rgba(0,108,73,0.18)]
        transition-all duration-200
        hover:bg-[#005b3d]
        hover:shadow-[0_6px_16px_rgba(0,108,73,0.22)]
        active:scale-[0.99]
        disabled:cursor-not-allowed
        disabled:bg-[#aeb8b3]
        disabled:shadow-none
        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-[#006c49]/30
        focus-visible:ring-offset-2
      "
      aria-busy={loading}
    >
      {loading ? (
        <>
          <Loader2
            size={18}
            className="animate-spin"
            aria-hidden="true"
          />
          <span>Creating account...</span>
        </>
      ) : (
        <>
          <span>Create account</span>
          <Check
            size={18}
            className="shrink-0"
            aria-hidden="true"
          />
        </>
      )}
    </button>

    {/* Security note */}
    <div className="mt-4 flex items-center justify-center gap-1.5">
      <ShieldCheck
        size={14}
        className="shrink-0 text-[#006c49]"
        aria-hidden="true"
      />

      <span
        className="
          text-[11px] font-medium
          leading-4 text-[#646477]
        "
      >
        Your password is securely protected
      </span>
    </div>
  </form>
)}

      {view === 'forgot-password' && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void startForgot();
          }}
        >
          <div className="auth-notice-box mb-4 flex items-start gap-2.5 rounded-xl p-3">
            <Info size={18} className="mt-0.5 shrink-0 text-[#3525cd]" />
            <p className="text-[12px] leading-4 tracking-[0.01em] text-[#464555]">
              If an account exists, we'll send a verification code.
            </p>
          </div>

          <Field
            label="Email or phone"
            name="reset-identifier"
            value={resetIdentifier}
            onChange={setResetIdentifier}
            autoComplete="username"
            placeholder="name@domain.com or phone"
            inputMode="text"
            identity
            autoFocus
          />

          <button type="submit" disabled={loading} className="auth-primary mt-4">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <><span>Send verification code</span><Send size={18} /></>}
          </button>

          <button
            type="button"
            onClick={() => setView('login-password')}
            className={`${TAP_TARGET} mt-2 w-full text-[12px] font-semibold leading-4 tracking-[0.02em] text-[#3525cd] hover:underline`}
          >
            Remember your password? Log in
          </button>
        </form>
      )}

      {view === 'reset-otp' && (
        <>
          <p className="mt-1 text-center text-[14px] leading-5 tracking-[0em] text-[#464555]">
            We sent a 6-digit code to <span className={`${LABEL} text-[#131b2e]`}>{maskEmail(resetIdentifier)}</span>
          </p>

          <div className="mt-4">
            <OtpInput
              value={otp}
              onChange={(next) => {
                setOtp(next);
                if (otpStatus !== 'verifying') setOtpStatus('idle');
              }}
              status={otpStatus}
              autoFocus
              disabled={loading}
              ariaLabel="6 digit reset verification code"
              onComplete={(code) => void verifyResetOtp(code)}
            />
          </div>

          <div className="mt-3 flex flex-col items-center gap-1">
            <OtpStatusLine status={otpStatus} className="mt-0" />
            {notice ? <p className="text-center text-[12px] leading-4 tracking-[0.01em] text-[#464555]">{notice}</p> : null}
          </div>

          <ResendRow
            secondsLeft={resendIn}
            loading={loading}
            onResend={() => void resendOtp()}
          />
        </>
      )}

      {view === 'reset-password' && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void doReset();
          }}
        >
          <PasswordField
            label="New password"
            name="new-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            autoFocus
          />
          <div className="mt-3">
            <PasswordField
              label="Confirm password"
              name="confirm-password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
          </div>

          {confirm && password !== confirm ? (
            <div className="auth-error-box mt-2 flex items-center gap-2 rounded-xl p-2.5">
              <X size={16} className="shrink-0" />
              <span className="text-[12px] leading-4 tracking-[0.01em]">Passwords do not match</span>
            </div>
          ) : null}

          <div className="mt-3 rounded-xl bg-[#f2f3ff] p-3">
            <div className="flex items-center gap-2 text-[12px] leading-4 tracking-[0.01em] text-[#464555]">
              {isPasswordValid(password) ? (
                <CheckCircle2 size={16} className="shrink-0 text-[#006c49]" />
              ) : (
                <Circle size={16} className="shrink-0 text-[#777587]" />
              )}
              <span>Requires 8+ characters &amp; 1 number</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !isPasswordValid(password) || password !== confirm}
            className="auth-primary mt-4"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <><span>Reset password</span><LockKeyhole size={18} /></>}
          </button>
        </form>
      )}

      {view === 'reset-success' && (
        <>
          <div className="auth-success-emblem relative mx-auto my-2 flex h-20 w-20 items-center justify-center">
            <span aria-hidden="true" className="auth-success-ping absolute inset-0 rounded-full bg-[#6cf8bb]/40" />
            <span className="auth-success-mark relative flex h-16 w-16 items-center justify-center rounded-full bg-[#006c49] text-[#ffffff] shadow-lg">
              <Check size={34} />
            </span>
          </div>
          <p className={`${HEADING} mt-2 text-center`}>Password updated</p>
          <p className="mt-0.5 text-center text-[16px] leading-6 text-[#464555]">Your new password is ready.</p>
          <button
            type="button"
            onClick={() => {
              setIdentifier(resetIdentifier);
              setPassword('');
              setConfirm('');
              setView('login-password');
            }}
            className="auth-primary mt-5"
          >
            Log in
          </button>
        </>
      )}

      {view === 'success' && (
        <>
          <div className="auth-success-emblem relative mx-auto my-2 flex h-20 w-20 items-center justify-center">
            <span aria-hidden="true" className="auth-success-ping absolute inset-0 rounded-full bg-[#6cf8bb]/40" />
            <span className="auth-success-mark relative flex h-16 w-16 items-center justify-center rounded-full bg-[#006c49] text-[#ffffff] shadow-lg">
              <Check size={34} />
            </span>
          </div>

          <div className="mt-2 flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-1.5">
              <span className={HEADING}>Welcome to LofiMart</span>
              <span aria-hidden="true" className="text-[20px]">
                🎉
              </span>
            </span>
            <p className="mt-0.5 text-[16px] leading-6 text-[#464555]">Your account is ready.</p>
            <p className={`${LABEL} mt-1 text-[#3525cd]`}>What would you like to do?</p>
          </div>

          <button
            type="button"
            onClick={() => {
              closeAuth();
              router.replace(destination);
            }}
            className="auth-primary mt-5"
          >
            <ShoppingCart size={18} />
            <span>Start Shopping</span>
          </button>

          <div className="my-4 flex w-full items-center gap-2">
            <span className="h-px flex-1 bg-[#dae2fd]" />
            <span className={`${LABEL_SM} text-[#464555]`}>Want to sell or resell?</span>
            <span className="h-px flex-1 bg-[#dae2fd]" />
          </div>

          <div className="grid w-full grid-cols-1 gap-2.5">
            <button
              type="button"
              onClick={() => void startOnboarding('seller')}
              disabled={loading}
              className="auth-ecosystem-card flex items-center justify-between gap-3 rounded-2xl p-3 text-left"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#3525cd] shadow-sm">
                  <Store size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold leading-5 tracking-[0.01em] text-[#131b2e]">
                    Become a Seller
                  </span>
                  <span className="block text-[12px] leading-4 tracking-[0.01em] text-[#464555]">
                    Store setup in 4 quick steps
                  </span>
                </span>
              </span>
              <span className="flex-shrink-0 rounded-full bg-[#faf8ff] px-2 py-0.5 text-[10px] font-bold leading-3 tracking-[0.04em] text-[#131b2e] shadow-sm">
                1/4 Step
              </span>
            </button>

            <button
              type="button"
              onClick={() => void startOnboarding('reseller')}
              disabled={loading}
              className="auth-ecosystem-card flex items-center justify-between gap-3 rounded-2xl p-3 text-left"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#006c49] shadow-sm">
                  <Share2 size={20} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold leading-5 tracking-[0.01em] text-[#131b2e]">
                    Become a Reseller
                  </span>
                  <span className="block text-[12px] leading-4 tracking-[0.01em] text-[#464555]">
                    Share links &amp; earn 12% margins
                  </span>
                </span>
              </span>
              <span className="flex-shrink-0 rounded-full bg-[#faf8ff] px-2 py-0.5 text-[10px] font-bold leading-3 tracking-[0.04em] text-[#131b2e] shadow-sm">
                1/3 Step
              </span>
            </button>
          </div>
        </>
      )}
    </>
  );

  const viewBadge: Partial<Record<AuthView, string>> = {
    'login-password': 'Step 2 of 2',
    'signup-start': 'New account',
    'forgot-password': 'Account recovery',
    'reset-password': 'Identity verified',
  };

  /**
   * Steps that already prove progress lead with a status pill instead of a
   * back arrow, so the row never shows two competing leading controls.
   */
  const leadingPill =
    view === 'signup-password'
      ? 'Email verified'
      : view === 'reset-password'
        ? 'Identity verified'
        : null;

  /**
   * The code-entry steps carry their title in the navigation row, so the body
   * starts straight with the delivery copy.
   */
  const inlineTitle: Partial<Record<AuthView, string>> = {
    'signup-otp': 'Verify your email',
    'reset-otp': 'Verify your identity',
  };

  const inlineTitleText = inlineTitle[view];

  /**
   * The success screens carry their own centred headline block, so the shared
   * header keeps the labels for assistive tech only.
   */
  const isCenteredView = view === 'success' || view === 'reset-success';
  const hideSharedHeading = isCenteredView || Boolean(inlineTitleText);

  return (
    <div
      className="auth-overlay fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto overscroll-contain bg-[#131b2e]/45 backdrop-blur-md sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) closeAuth();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lofimart-auth-title"
        aria-describedby="lofimart-auth-subtitle"
        className="auth-modal-panel relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-black/30 sm:my-auto sm:rounded-3xl"
      >
        {/* Bottom-sheet drag cue, phones only. */}
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-12 flex-shrink-0 rounded-full bg-[#dae2fd] sm:hidden" />

        <div className="auth-modal-header flex items-center justify-between gap-2 px-5 pt-3 sm:px-6 sm:pt-5">
          {leadingPill ? (
            <span className="auth-verified-pill inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1">
              <CheckCircle2 size={14} className="shrink-0" />
              <span className="truncate">{leadingPill}</span>
            </span>
          ) : view === 'entry' ? (
            <span aria-hidden="true" className="auth-brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[#3525cd]">
              <ShoppingBag size={20} fill="currentColor" />
            </span>
          ) : (
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            >
              <span className="auth-icon-surface flex h-8 w-8 items-center justify-center rounded-full text-[#131b2e]">
                <ArrowLeft size={18} />
              </span>
            </button>
          )}

          {view === 'entry' ? (
            <div className="min-w-0 flex-1" />
          ) : inlineTitleText ? (
            <span className="min-w-0 flex-1 truncate text-center text-[16px] font-semibold leading-6 tracking-[0em] text-[#131b2e]">
              {inlineTitleText}
            </span>
          ) : viewBadge[view] && !leadingPill ? (
            <span className={`auth-view-badge min-w-0 max-w-[46%] truncate rounded-full px-2.5 py-0.5 text-[#464555] ${LABEL_SM} ${view === 'signup-otp' ? 'bg-[#6cf8bb] !text-[#00714d]' : ''}`}>
              {viewBadge[view]}
            </span>
          ) : (
            <span aria-hidden="true" className="min-w-0 flex-1" />
          )}

          <button
            type="button"
            onClick={closeAuth}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          >
            <span className="auth-icon-surface flex h-8 w-8 items-center justify-center rounded-full text-[#464555]">
              <X size={18} />
            </span>
          </button>
        </div>

        <div ref={scrollRef} className="auth-scroll min-h-0 max-h-[calc(100vh-2rem)] overflow-y-auto px-5 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
          <h2 id="lofimart-auth-title" className={hideSharedHeading ? 'sr-only' : `${HEADING} text-left`}>
            {title[view]}
          </h2>
          <p id="lofimart-auth-subtitle" className={hideSharedHeading ? 'sr-only' : `mt-1 ${BODY} text-left`}>
            {subtitle[view]}
          </p>
          {error ? (
            <div role="alert" className="auth-error-box mt-3 flex items-start gap-2 rounded-xl p-2.5">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span className="text-[12px] leading-4 tracking-[0.01em]">{error}</span>
            </div>
          ) : null}
          {content}
        </div>
      </div>

      <style jsx>{`
        .auth-overlay{
          /* dvh tracks the collapsing mobile browser chrome; vh is the fallback */
          height:100vh;height:100dvh;
          /* Phones: sheet sits flush to the bottom edge, only the safe areas pad. */
          padding-top:env(safe-area-inset-top,0px);
          padding-bottom:env(safe-area-inset-bottom,0px);
          padding-left:env(safe-area-inset-left,0px);
          padding-right:env(safe-area-inset-right,0px);
        }
        .auth-scroll{
          max-height:calc(100vh - 2rem);
          max-height:calc(100dvh - 2rem);
          /* keep the sticky-feeling header reachable on short landscape screens */
          overscroll-behavior:contain;
          -webkit-overflow-scrolling:touch;
        }
        @media (min-width:640px){
          .auth-overlay{padding-top:1rem;padding-bottom:1rem;padding-left:1rem;padding-right:1rem}
          .auth-scroll{max-height:min(813px,calc(100vh - 2rem));max-height:min(813px,calc(100dvh - 2rem))}
        }
        .auth-modal-panel{animation:auth-modal-in .2s ease-out both;background:#ffffff}
        .auth-modal-header{background:transparent}
        .auth-brand-mark{background:#e2e7ff}
        /* Step pill, 10px/700 uppercase as in the design tokens. */
        .auth-view-badge{background:#eaedff}
        .auth-verified-pill{background:#6cf8bb;color:#00714d;font-size:10px;font-weight:700;line-height:12px;letter-spacing:.04em;text-transform:uppercase}
        /* 44px hit area wrapping the 32px circular surface from the spec. */
        .auth-icon-surface{background:#eaedff;transition:background .18s,color .18s}
        .auth-icon-surface:hover{background:#e2e7ff}
        button:focus-visible > .auth-icon-surface{outline:2px solid #3525cd;outline-offset:2px}
        .auth-account-badge{background:#f2f3ff}
        .auth-account-avatar{background:#4f46e5;color:#dad7ff}
        .auth-notice-box{background:#f2f3ff}
        .auth-next-step{background:#eaedff;opacity:.8}
        .auth-error-box{background:#ffdad6;color:#93000a}
        .auth-ecosystem-card{background:#eaedff;transition:background .18s}
        .auth-ecosystem-card:hover{background:#e2e7ff}
        .auth-ecosystem-card:disabled{cursor:not-allowed;opacity:.6}
        .auth-success-ping{animation:auth-success-ping 1.6s cubic-bezier(0,0,.2,1) infinite}
        @keyframes auth-success-ping{0%{transform:scale(.75);opacity:.7}70%{transform:scale(1.25);opacity:0}100%{transform:scale(1.25);opacity:0}}
        @keyframes auth-modal-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
        .auth-success-mark{animation:auth-success-in .22s ease-out both}
        @keyframes auth-success-in{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
        .auth-primary{display:flex;min-height:48px;width:100%;align-items:center;justify-content:center;gap:.5rem;border-radius:.75rem;background:#3525cd;padding:.75rem 1rem;color:#fff;font-size:14px;font-weight:600;line-height:20px;letter-spacing:.01em;box-shadow:0 4px 6px rgba(19,27,46,.16);transition:background .18s,box-shadow .18s,transform .18s}
        .auth-primary:hover{background:#2f21ad;box-shadow:0 6px 10px rgba(19,27,46,.2)}
        .auth-primary:active{transform:scale(.99)}
        .auth-primary:disabled{cursor:not-allowed;opacity:.55;transform:none}
        .auth-social{display:flex;min-height:48px;width:100%;align-items:center;justify-content:center;gap:.75rem;border-radius:.75rem;border:0;background:#f2f3ff;padding:.75rem 1rem;color:#131b2e;font-size:14px;font-weight:600;line-height:20px;letter-spacing:.01em;box-shadow:0 1px 2px rgba(19,27,46,.08);transition:background .18s,transform .18s}
        .auth-social:hover{background:#eaedff}
        .auth-social:active{transform:scale(.99)}
        .auth-social:disabled{cursor:not-allowed;opacity:.55}
        @media (max-width:640px){:global(body){overflow-x:hidden}.auth-modal-panel{margin-bottom:env(safe-area-inset-bottom,0px)}.auth-primary,.auth-social{min-height:50px}}
        @media (prefers-reduced-motion:reduce){
          .auth-modal-panel,.auth-success-mark,.auth-success-ping{animation:none}
        }
      `}</style>
    </div>
  );
}
