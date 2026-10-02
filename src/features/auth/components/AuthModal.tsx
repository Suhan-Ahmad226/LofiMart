'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Facebook, Loader2, Mail, Lock, ShieldCheck, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthModal, type AuthView } from '@/features/auth/context/AuthModalContext';
import OtpInput from '@/features/auth/components/OtpInput';
import {
  buildAuthCallbackUrl,
  getSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
  loginWithPassword,
  mapAuthMessage,
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

function Field({ label, value, onChange, type = 'text', autoComplete, placeholder, right }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; placeholder?: string; right?: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="relative block">
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
        />
        {right}
      </span>
    </label>
  );
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
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
        <button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}

export default function AuthModal() {
  const { isOpen, view, returnTo, closeAuth, setView } = useAuthModal();
  const { login, user, isAuthenticated } = useUser();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resetIdentifier, setResetIdentifier] = useState('');

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn(v => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  useEffect(() => {
    if (searchParams.get('auth_success') !== '1') return;
    const cleanUrl = window.location.pathname + Array.from(searchParams.entries()).filter(([key]) => key !== 'auth_success').length
      ? '' : window.location.pathname;
    const current = new URL(window.location.href);
    current.searchParams.delete('auth_success');
    window.history.replaceState({}, '', current.pathname + (current.search ? current.search : ''));
  }, [searchParams]);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) closeAuth();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, closeAuth]);

  const destination = useMemo(() => {
    if (returnTo && !returnTo.startsWith('/login') && !returnTo.startsWith('/register')) returnTo;
    return '/account/dashboard';
  }, [returnTo]);

  const goBack = () => {
    setError('');
    setNotice('');
    if (view === 'entry') closeAuth();
    else if (view === 'login-password' || view === 'signup-otp' || view === 'forgot-password') setView('entry');
    else if (view === 'signup-password') setView('signup-otp');
    else if (view === 'reset-otp') setView('forgot-password');
    else if (view === 'reset-password') setView('reset-otp');
    else setView('entry');
  };

  const finishLogin = async (result: { user: any; accessToken?: string }) => {
    login(result.user, result.accessToken);
    closeAuth();
    router.replace(resolvePostAuthDestination(result.user.role, destination));
  };

  const continueIdentifier = async () => {
    const value = identifier.trim();
    if (!value) return setError('Enter your email or phone number.');
    setLoading(true); setError('');
    try {
      const result = await fetch('/api/auth/identifier-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: value }) });
      const data = await result.json().catch(() => null);
      if (result.ok && data?.exists) {
        setIdentifier(value);
        setView('login-password');
      } else {
        if (!EMAIL_RE.test(value)) {
          setError('New account registration currently uses email. Please enter an email address.');
          return;
        }
        setEmail(value.toLowerCase());
        setView('signup-otp');
        await sendSignupOtp(value.toLowerCase());
      }
    } catch (e) {
      setError(mapAuthMessage(e));
    } finally { setLoading(false); }
  };

  const sendSignupOtp = async (target = email) => {
    const clean = target.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) { setError('Enter a valid email address.'); return; }
    setLoading(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/auth/pre-register-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: clean }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Unable to send verification code.');
      setEmail(clean); setResendIn(60); setNotice(`Verification code sent to ${maskEmail(clean)}.`);
    } catch (e) { setError(mapAuthMessage(e)); }
    finally { setLoading(false); }
  };

  const verifySignupOtp = async (code: string) => {
    if (code.length !== 6) return;
    setLoading(true); setError('');
    try {
      const supabase = await getSupabaseBrowserClient();
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (verifyError) throw verifyError;
      setOtp(code);
      setNotice('✓ Email verified');
      setView('signup-password');
    } catch (e) { setOtp(''); setError(mapAuthMessage(e)); }
    finally { setLoading(false); }
  };

  const completeSignup = async () => {
    if (password.length < 8 || !/[0-9]/.test(password)) {
      setError('Password must be at least 8 characters and include a number.');
      return;
    }
    setLoading(true); setError('');
    try {
      const supabase = await getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Your verification session expired. Please start again.');
      const response = await fetch('/api/auth/complete-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: name.trim() || email.split('@')[0], email, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Registration failed.');
      if (data?.user) {
        login(data.user, accessToken);
      }
      setView('success');
    } catch (e) { setError(mapAuthMessage(e)); }
    finally { setLoading(false); }
  };

  const doPasswordLogin = async () => {
    if (!identifier.trim() || !password) return setError('Email or phone number and password are required.');
    setLoading(true); setError('');
    try {
      const result = await loginWithPassword({ identifier, password, redirectTarget: destination });
      await finishLogin(result);
    } catch (e) { setError(mapAuthMessage(e)); }
    finally { setLoading(false); }
  };

  const startForgot = async () => {
    const value = resetIdentifier.trim();
    if (!value) return setError('Enter your email or phone number.');
    setLoading(true); setError(''); setNotice('');
    try {
      await requestPasswordReset({ identifier: value });
      setResendIn(60);
      setView('reset-otp');
      setNotice('If an account exists, a verification code has been sent.');
    } catch (e) { setError(mapAuthMessage(e)); }
    finally { setLoading(false); }
  };

  const verifyResetOtp = async (code: string) => {
    if (code.length !== 6) return;
    setLoading(true); setError('');
    try {
      await verifyOtpCode({ identifier: resetIdentifier, purpose: 'reset_password', pin: code });
      setOtp(code);
      setView('reset-password');
    } catch (e) { setOtp(''); setError(mapAuthMessage(e)); }
    finally { setLoading(false); }
  };

  const doReset = async () => {
    if (password.length < 8 || !/[0-9]/.test(password)) return setError('Password must be at least 8 characters and include a number.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true); setError('');
    try {
      await resetPasswordWithOtp({ identifier: resetIdentifier, newPassword: password });
      setView('success');
      setNotice('Password updated successfully.');
    } catch (e) { setError(mapAuthMessage(e)); }
    finally { setLoading(false); }
  };

  const social = async (provider: 'google' | 'facebook') => {
    setLoading(true); setError('');
    try {
      const supabase = await getSupabaseBrowserClient();
      if (!hasSupabaseBrowserEnv()) throw new Error('Supabase auth is not configured.');
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: buildAuthCallbackUrl({ redirectTarget: destination, mode: 'register' }) },
      });
      if (oauthError) throw oauthError;
    } catch (e) { setError(mapAuthMessage(e)); setLoading(false); }
  };

  if (!isOpen) return null;

  const title: Record<AuthView, string> = {
    entry: 'Welcome to LofiMart 👋',
    'login-password': 'Welcome back 👋',
    'signup-otp': 'Verify your email ✉️',
    'signup-password': 'Create your password',
    'forgot-password': 'Forgot password?',
    'reset-otp': 'Verify your identity',
    'reset-password': 'Reset password',
    success: 'Welcome to LofiMart 👋',
  };

  const content = (
    <>
      {view === 'entry' && (
        <>
          <p className="mb-5 text-center text-sm text-slate-500">Sign in or create account</p>
          <div className="space-y-3">
            <button type="button" onClick={() => void social('google')} disabled={loading} className="auth-social"><span className="font-bold text-lg">G</span> Continue with Google</button>
            <button type="button" onClick={() => void social('facebook')} disabled={loading} className="auth-social"><Facebook size={18} fill="currentColor" /> Continue with Facebook</button>
          </div>
          <div className="my-5 flex items-center gap-3 text-xs font-semibold text-slate-400"><span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" /></div>
          <Field label="Email or phone" value={identifier} onChange={setIdentifier} autoComplete="username" placeholder="Email or phone" />
          <button type="button" onClick={() => void continueIdentifier()} disabled={loading} className="auth-primary mt-4">{loading ? <Loader2 className="animate-spin" size={18} /> : 'Continue'}</button>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} /> Secure authentication</div>
        </>
      )}

      {view === 'login-password' && (
        <>
          <p className="mb-5 text-center text-sm text-slate-500">{identifier}</p>
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          <button type="button" onClick={() => void doPasswordLogin()} disabled={loading} className="auth-primary mt-5">{loading ? <Loader2 className="animate-spin" size={18} /> : 'Login'}</button>
          <button type="button" onClick={() => { setResetIdentifier(identifier); setView('forgot-password'); }} className="mt-4 w-full text-center text-sm font-semibold text-slate-700 hover:underline">Forgot password?</button>
        </>
      )}

      {view === 'signup-otp' && (
        <>
          <p className="text-center text-sm text-slate-500">Code sent to <strong>{maskEmail(email)}</strong></p>
          <div className="py-6"><OtpInput value={otp} onChange={setOtp} autoFocus disabled={loading} ariaLabel="6 digit email verification code" onComplete={verifySignupOtp} /></div>
          {notice ? <p className="text-center text-xs text-emerald-600">{notice}</p> : null}
          {resendIn > 0 ? <p className="mt-3 text-center text-xs text-slate-500">Resend code in {resendIn}s</p> : <button type="button" onClick={() => void sendSignupOtp()} className="mx-auto mt-3 block text-sm font-semibold text-slate-700 hover:underline">Resend code</button>}
        </>
      )}

      {view === 'signup-password' && (
        <>
          <div className="mb-5 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600"><Check size={18} /> Email verified</div>
          <Field label="Name" value={name} onChange={setName} autoComplete="name" placeholder="Your name" />
          <div className="mt-4"><PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" /></div>
          <p className="mt-2 text-xs text-slate-500">Use at least 8 characters and one number.</p>
          <button type="button" onClick={() => void completeSignup()} disabled={loading} className="auth-primary mt-5">{loading ? <Loader2 className="animate-spin" size={18} /> : 'Create account'}</button>
        </>
      )}

      {view === 'forgot-password' && (
        <>
          <p className="mb-5 text-center text-sm text-slate-500">We’ll help you reset it.</p>
          <Field label="Email or phone" value={resetIdentifier} onChange={setResetIdentifier} autoComplete="username" placeholder="Email or phone" />
          <p className="mt-2 text-xs text-slate-500">If an account exists for this email, we'll send a verification code.</p>
          <button type="button" onClick={() => void startForgot()} disabled={loading} className="auth-primary mt-5">{loading ? <Loader2 className="animate-spin" size={18} /> : 'Send verification code'}</button>
        </>
      )}

      {view === 'reset-otp' && (
        <>
          <p className="text-center text-sm text-slate-500">{notice || 'Enter the 6-digit code sent to you.'}</p>
          <div className="py-6"><OtpInput value={otp} onChange={setOtp} autoFocus disabled={loading} ariaLabel="6 digit reset verification code" onComplete={verifyResetOtp} /></div>
          {resendIn > 0 ? <p className="text-center text-xs text-slate-500">Resend code in {resendIn}s</p> : <button type="button" onClick={() => void startForgot()} className="mx-auto block text-sm font-semibold text-slate-700 hover:underline">Resend code</button>}
        </>
      )}

      {view === 'reset-password' && (
        <>
          <div className="mb-5 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600"><Check size={18} /> Identity verified</div>
          <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
          <div className="mt-4"><PasswordField label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" /></div>
          <button type="button" onClick={() => void doReset()} disabled={loading} className="auth-primary mt-5">{loading ? <Loader2 className="animate-spin" size={18} /> : 'Reset password'}</button>
        </>
      )}

      {view === 'success' && (
        <>
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={30} /></div>
          <p className="text-center text-sm text-slate-600">{notice || 'Your account is ready.'}</p>
          <button type="button" onClick={() => { closeAuth(); router.replace(destination); }} className="auth-primary mt-5">Start Shopping</button>
          <div className="my-5 border-t border-slate-100 pt-5 text-center text-sm font-semibold text-slate-600">Want to sell or resell?</div>
          <button type="button" onClick={() => { closeAuth(); router.push('/seller/onboarding'); }} className="auth-secondary">Become a Seller</button>
          <button type="button" onClick={() => { closeAuth(); router.push('/reseller/onboarding'); }} className="auth-secondary mt-2">Become a Reseller</button>
        </>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !loading) closeAuth(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="lofimart-auth-title" className="w-full max-w-[460px] overflow-hidden rounded-[24px] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <button type="button" onClick={goBack} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">{view === 'entry' ? <X size={20} /> : <ArrowLeft size={20} />}</button>
          <div className="text-sm font-bold text-slate-950">LofiMart</div>
          <button type="button" onClick={closeAuth} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <h2 id="lofimart-auth-title" className="text-center text-2xl font-bold tracking-tight text-slate-950">{title[view]}</h2>
          {error ? <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">{error}</div> : null}
          {content}
        </div>
      </div>
      <style jsx>{`
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
