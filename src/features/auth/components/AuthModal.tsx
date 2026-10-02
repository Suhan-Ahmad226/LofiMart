'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Facebook, Loader2, ShieldCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthModal, type AuthView } from '@/features/auth/context/AuthModalContext';
import OtpInput from '@/features/auth/components/OtpInput';
import {
  buildAuthCallbackUrl,
  getSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
  loginWithPassword,
  mapAuthMessage,
  rememberPendingOAuthRedirect,
  requestEmailVerification,
  requestPasswordReset,
  resetPasswordWithOtp,
  resolvePostAuthDestination,
  verifyOtpCode,
} from '@/lib/auth-ui';
import { useUser } from '@/features/shared/state/UserContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(value: string) {
  const [name, domain] = value.split('@');
  if (!domain) return value;
  return `${name.slice(0, 1)}***@${domain}`;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
  right,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  right?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="relative block">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
        />
        {right}
      </span>
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <Field
      label={label}
      value={value}
      onChange={onChange}
      type={visible ? 'text' : 'password'}
      autoComplete={autoComplete}
      placeholder="••••••••"
      right={
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          onClick={() => setVisible((current) => !current)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}

type OtpFlow = 'register' | 'login-verify' | 'reset';

export default function AuthModal() {
  const { isOpen, view, returnTo, closeAuth, setView, openAuth } = useAuthModal();
  const { login } = useUser();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
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
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

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
    setPassword('');
    setConfirm('');
  }, [isOpen, view]);

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

    focusable()[0]?.focus();

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
      setView('signup-otp');
      setResendIn(60);
      setNotice(`Verification code sent to ${maskEmail(clean)}.`);
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async () => {
    if (password.length < 8 || !/[0-9]/.test(password)) {
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
    if (code.length !== 6 || loading) return;

    setLoading(true);
    setError('');

    try {
      if (otpFlow === 'login-verify') {
        await verifyOtpCode({ identifier: email, purpose: 'verify_email', pin: code });
        setOtp(code);
        const result = await loginWithPassword({
          identifier,
          password: pendingLoginPassword,
          redirectTarget: destination,
        });
        finishLogin(result);
        return;
      }

      const supabase = await getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });

      if (verifyError) throw verifyError;

      setOtp(code);
      setNotice('✓ Email verified');
      setView('signup-password');
    } catch (requestError) {
      setOtp('');
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
      await requestPasswordReset({ identifier: value });
      setResendIn(60);
      setOtpFlow('reset');
      setView('reset-otp');
      setNotice('If an account exists, a verification code has been sent.');
    } catch (requestError) {
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const verifyResetOtp = async (code: string) => {
    if (code.length !== 6 || loading) return;

    setLoading(true);
    setError('');

    try {
      await verifyOtpCode({ identifier: resetIdentifier, purpose: 'reset_password', pin: code });
      setOtp(code);
      setView('reset-password');
    } catch (requestError) {
      setOtp('');
      setError(mapAuthMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const doReset = async () => {
    if (password.length < 8 || !/[0-9]/.test(password)) {
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
          redirectTo: buildAuthCallbackUrl({ redirectTarget: destination, mode: 'login' }),
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
    'signup-otp': otpFlow === 'login-verify' ? 'Verify your email ✉️' : 'Verify your email ✉️',
    'signup-password': 'Create your password',
    'forgot-password': 'Forgot password?',
    'reset-otp': 'Verify your identity',
    'reset-password': 'Reset password',
    success: 'Welcome to LofiMart 👋',
    'reset-success': 'Password updated',
  };

  const content = (
    <>
      {view === 'entry' && (
        <>
          <p className="mb-5 text-center text-sm text-slate-500">Sign in or create account</p>
          <div className="space-y-3">
            <button type="button" onClick={() => void social('google')} disabled={loading} className="auth-social">
              <span className="font-bold text-lg">G</span> Continue with Google
            </button>
            <button type="button" onClick={() => void social('facebook')} disabled={loading} className="auth-social">
              <Facebook size={18} fill="currentColor" /> Continue with Facebook
            </button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" />
          </div>

          <Field
            label="Email or phone"
            value={identifier}
            onChange={setIdentifier}
            autoComplete="username"
            placeholder="Email or phone"
          />

          <button type="button" onClick={() => void continueIdentifier()} disabled={loading} className="auth-primary mt-4">
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Continue'}
          </button>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={15} /> Secure authentication
          </div>
        </>
      )}

      {view === 'login-password' && (
        <>
          <p className="mb-5 text-center text-sm text-slate-500">{email ? maskEmail(email) : identifier}</p>
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <button type="button" onClick={() => void doPasswordLogin()} disabled={loading} className="auth-primary mt-5">
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Login'}
          </button>
          <button
            type="button"
            onClick={() => {
              setResetIdentifier(email || identifier);
              setView('forgot-password');
            }}
            className="mt-4 w-full text-center text-sm font-semibold text-slate-700 hover:underline"
          >
            Forgot password?
          </button>
          <button
            type="button"
            onClick={() => {
              if (!email) {
                setError('New accounts require an email address.');
                return;
              }
              setError('');
              setView('signup-start');
            }}
            className="mt-3 w-full text-center text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
          >
            New to LofiMart? Create an account
          </button>
          <button type="button" onClick={() => setView('entry')} className="mt-3 w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-800 hover:underline">
            ← Use another account
          </button>
        </>
      )}

      {view === 'signup-start' && (
        <>
          <p className="mb-2 text-center text-sm text-slate-500">We'll verify your email before creating the account.</p>
          <p className="mb-5 text-center text-sm font-semibold text-slate-800">{maskEmail(email)}</p>
          <Field label="Email" value={email} onChange={setEmail} autoComplete="email" placeholder="you@example.com" />
          <button type="button" onClick={() => void sendSignupOtp()} disabled={loading} className="auth-primary mt-5">
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Send verification code'}
          </button>
        </>
      )}

      {view === 'signup-otp' && (
        <>
          <p className="text-center text-sm text-slate-500">
            Code sent to <strong>{maskEmail(email)}</strong>
          </p>
          <div className="py-6">
            <OtpInput
              value={otp}
              onChange={setOtp}
              autoFocus
              disabled={loading}
              ariaLabel="6 digit email verification code"
              onComplete={(code) => void verifySignupOtp(code)}
            />
          </div>
          {notice ? <p className="text-center text-xs text-emerald-600">{notice}</p> : null}
          {resendIn > 0 ? (
            <p className="mt-3 text-center text-xs text-slate-500">Resend code in {resendIn}s</p>
          ) : (
            <button
              type="button"
              onClick={() => (otpFlow === 'register' ? void sendSignupOtp() : otpFlow === 'login-verify' ? void requestEmailVerification({ identifier: email }) : void startForgot())}
              className="mx-auto mt-3 block text-sm font-semibold text-slate-700 hover:underline"
            >
              Resend code
            </button>
          )}
        </>
      )}

      {view === 'signup-password' && (
        <>
          <div className="mb-5 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600">
            <Check size={18} /> Email verified
          </div>
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
          <p className="mt-2 text-xs text-slate-500">Use at least 8 characters and one number.</p>
          <button type="button" onClick={() => void completeRegistration()} disabled={loading} className="auth-primary mt-5">
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Create account'}
          </button>
        </>
      )}

      {view === 'forgot-password' && (
        <>
          <p className="mb-5 text-center text-sm text-slate-500">We'll help you reset it.</p>
          <Field label="Email or phone" value={resetIdentifier} onChange={setResetIdentifier} autoComplete="username" placeholder="Email or phone" />
          <p className="mt-2 text-xs text-slate-500">If an account exists, we'll send a verification code.</p>
          <button type="button" onClick={() => void startForgot()} disabled={loading} className="auth-primary mt-5">
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Send verification code'}
          </button>
          <button type="button" onClick={() => setView('login-password')} className="mt-4 w-full text-center text-sm font-semibold text-slate-600 hover:underline">
            Remember your password? Log in
          </button>
        </>
      )}

      {view === 'reset-otp' && (
        <>
          <p className="text-center text-sm text-slate-500">{notice || 'Enter the 6-digit code sent to you.'}</p>
          <div className="py-6">
            <OtpInput value={otp} onChange={setOtp} autoFocus disabled={loading} ariaLabel="6 digit reset verification code" onComplete={(code) => void verifyResetOtp(code)} />
          </div>
          {resendIn > 0 ? (
            <p className="text-center text-xs text-slate-500">Resend code in {resendIn}s</p>
          ) : (
            <button type="button" onClick={() => void startForgot()} className="mx-auto block text-sm font-semibold text-slate-700 hover:underline">
              Resend code
            </button>
          )}
        </>
      )}

      {view === 'reset-password' && (
        <>
          <div className="mb-5 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600">
            <Check size={18} /> Identity verified
          </div>
          <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
          <p className="mt-2 text-xs text-slate-500">Use at least 8 characters and one number.</p>
          <div className="mt-4">
            <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </div>
          <button type="button" onClick={() => void doReset()} disabled={loading} className="auth-primary mt-5">
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Reset password'}
          </button>
        </>
      )}

      {view === 'reset-success' && (
        <>
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={30} />
          </div>
          <p className="text-center text-sm font-semibold text-slate-900">Password updated successfully.</p>
          <p className="mt-2 text-center text-sm text-slate-500">Your new password is ready.</p>
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
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Check size={30} />
          </div>
          <p className="text-center text-sm font-semibold text-slate-900">Welcome to LofiMart 👋</p>
          <p className="mt-2 text-center text-sm text-slate-500">Your account is ready. What would you like to do?</p>

          <button type="button" onClick={() => { closeAuth(); router.replace(destination); }} className="auth-primary mt-5">
            Start Shopping
          </button>

          <div className="my-5 border-t border-slate-100 pt-5 text-center text-sm font-semibold text-slate-600">Want to sell or resell?</div>

          <button type="button" onClick={() => { closeAuth(); router.push('/seller/onboarding'); }} className="auth-secondary">
            Become a Seller
          </button>
          <button type="button" onClick={() => { closeAuth(); router.push('/reseller/onboarding'); }} className="auth-secondary mt-2">
            Become a Reseller
          </button>
        </>
      )}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) closeAuth();
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lofimart-auth-title" className="auth-modal-panel w-full max-w-[460px] overflow-hidden rounded-[24px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <button type="button" onClick={goBack} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            {view === 'entry' ? <X size={20} /> : <ArrowLeft size={20} />}
          </button>
          <div className="text-sm font-bold text-slate-950">LofiMart</div>
          <button type="button" onClick={closeAuth} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[min(760px,calc(100vh-32px))] overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
          <h2 id="lofimart-auth-title" className="text-center text-2xl font-bold tracking-tight text-slate-950">{title[view]}</h2>
          {error ? <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div> : null}
          {content}
        </div>
      </div>

      <style jsx>{`
        .auth-modal-panel{animation:auth-modal-in .2s ease-out both}
        @keyframes auth-modal-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
        .auth-primary{display:flex;min-height:48px;width:100%;align-items:center;justify-content:center;gap:.5rem;border-radius:.75rem;background:#0f172a;padding:.75rem 1rem;color:#fff;font-size:.9375rem;font-weight:700;transition:.18s}
        .auth-primary:hover{background:#1e293b}
        .auth-primary:disabled{cursor:not-allowed;opacity:.55}
        .auth-secondary{display:flex;min-height:48px;width:100%;align-items:center;justify-content:center;border-radius:.75rem;border:1px solid #e2e8f0;background:#fff;padding:.75rem 1rem;color:#334155;font-size:.9375rem;font-weight:700}
        .auth-social{display:flex;min-height:48px;width:100%;align-items:center;justify-content:center;gap:.6rem;border-radius:.75rem;border:1px solid #e2e8f0;background:#fff;padding:.75rem 1rem;color:#0f172a;font-size:.9375rem;font-weight:700}
        .auth-social:hover{background:#f8fafc}
        .auth-social:disabled{cursor:not-allowed;opacity:.55}
        @media (max-width:640px){:global(body){overflow-x:hidden}.auth-primary,.auth-secondary,.auth-social{min-height:50px}}
      `}</style>
    </div>
  );
}
