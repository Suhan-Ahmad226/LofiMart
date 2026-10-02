'use client';

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from '../../../lib/navigation';
import { AlertCircle, ArrowLeft, Fingerprint, Loader2 } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';
import { useAuthModal } from '@/features/auth/context/AuthModalContext';
import { normalizeRedirectTarget, resolvePostAuthDestination } from '../../../lib/auth-ui';
import OtpInput from '@/features/auth/components/OtpInput';

function getHashParams() {
  if (typeof window === 'undefined' || !window.location.hash) {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

type PendingOtp = {
  identifier: string;
  purpose: string;
  phone?: string | null;
};

type PendingExchange = {
  accessToken: string;
  mode: 'login' | 'register';
  role?: string;
  referralCode?: string;
  redirectTarget: string | null;
};

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useUser();
  const { openAuth } = useAuthModal();
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [pendingOtp, setPendingOtp] = useState<PendingOtp | null>(null);
  const [pendingExchange, setPendingExchange] = useState<PendingExchange | null>(null);
  const [otpPin, setOtpPin] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');

  const runExchange = useCallback(
    async (accessToken: string, currentMode: 'login' | 'register', role: string | undefined, referralCode: string | undefined, redirectTarget: string | null) => {
      const [{ exchangeSupabaseSession }, { default: toast }] = await Promise.all([
        import('@/lib/auth-ui'),
        import('react-hot-toast'),
      ]);

      const payload = await exchangeSupabaseSession({
        accessToken,
        role,
        referralCode,
        mode: currentMode,
        name: undefined,
      });

      login(payload.user);
      try {
        window.sessionStorage.removeItem('lofimart_pending_oauth');
      } catch {
        // ignore
      }
      toast.success(
        currentMode === 'register'
          ? `Welcome${payload.user?.name ? `, ${payload.user.name}` : ''}. Your account is ready.`
          : `Welcome back${payload.user?.name ? `, ${payload.user.name}` : ''}.`,
      );
      const destination = resolvePostAuthDestination(payload.user.role, redirectTarget);
      navigate(currentMode === 'register' ? `${destination}${destination.includes('?') ? '&' : '?'}auth_success=1` : destination, { replace: true });
    },
    [login, navigate],
  );

  useEffect(() => {
    const pending = (() => {
      try {
        const raw = window.sessionStorage.getItem('lofimart_pending_oauth');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })() as {
      redirectTarget?: string | null;
      role?: string | null;
      referralCode?: string | null;
      mode?: 'login' | 'register';
    } | null;

    const redirectTarget = normalizeRedirectTarget(searchParams.get('redirect')) || normalizeRedirectTarget(pending?.redirectTarget || null);
    const role = searchParams.get('role') || pending?.role || undefined;
    const referralCode = searchParams.get('ref') || pending?.referralCode || undefined;
    const currentMode = searchParams.get('mode') === 'register' || pending?.mode === 'register' ? 'register' : 'login';
    setMode(currentMode);

    const run = async () => {
      try {
        const { createClient, hasSupabaseBrowserEnv } = await import('@/lib/client');

        if (!hasSupabaseBrowserEnv()) {
          throw new Error('Supabase auth is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env.');
        }

        const callbackError =
          searchParams.get('error_description') ||
          searchParams.get('error') ||
          getHashParams().get('error_description') ||
          getHashParams().get('error');

        if (callbackError) {
          throw new Error(callbackError);
        }

        const supabase = createClient();
        const code = searchParams.get('code');
        const hashParams = getHashParams();

        if (code) {
          const { error: codeExchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeExchangeError) {
            throw codeExchangeError;
          }
        }

        const hashAccessToken = hashParams.get('access_token');
        const hashRefreshToken = hashParams.get('refresh_token');
        if (!code && hashAccessToken && hashRefreshToken) {
          const { error: hashSessionError } = await supabase.auth.setSession({
            access_token: hashAccessToken,
            refresh_token: hashRefreshToken,
          });

          if (hashSessionError) {
            throw hashSessionError;
          }

          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        const session = data.session;
        const accessToken = session?.access_token;
        if (!accessToken) {
          throw new Error('Supabase session not found');
        }

        try {
          await runExchange(accessToken, currentMode, role, referralCode, redirectTarget);
        } catch (err: unknown) {
          const details = err as {
            code?: string;
            identifier?: string;
            email?: string;
            purpose?: string;
            phone?: string | null;
          };
          if (details.code === 'EMAIL_UNVERIFIED') {
            setPendingOtp({
              identifier: details.identifier || details.email || '',
              purpose: details.purpose || 'verify_email',
              phone: details.phone ?? null,
            });
            setPendingExchange({
              accessToken,
              mode: currentMode,
              role,
              referralCode,
              redirectTarget,
            });
            return;
          }
          throw err;
        }
      } catch (err: unknown) {
        if (typeof window === 'undefined') return;
        const details = err as { code?: string; message?: string };
        if (details.code === 'PROVIDER_LINK_REQUIRED' || details.code === 'PROVIDER_LINK_CONFLICT') {
          setError(
            details.code === 'PROVIDER_LINK_CONFLICT'
              ? 'এই provider অ্যাকাউন্টটি ইতিমধ্যে অন্য একটি LofiMart অ্যাকাউন্টের সাথে যুক্ত। আগের অ্যাকাউন্টে login করুন।'
              : 'এই ইমেইলে একটি LofiMart অ্যাকাউন্ট আগে থেকেই আছে। নিজের email/password দিয়ে login করে অ্যাকাউন্ট সেটিংস থেকে Google/Facebook অ্যাকাউন্ট link করুন, অথবা পাসওয়ার্ড ভুলে গেলে "Forgot password" ব্যবহার করুন।',
          );
          return;
        }
        setError((await import('@/lib/auth-ui')).mapAuthMessage(details.message || err));
      }
    };

    void run();
  }, [runExchange, searchParams]);

  const handleVerifyOtp = async () => {
    if (!pendingOtp || !otpPin || otpPin.length < 6) {
      setOtpError('Enter the full 6-digit code.');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const { verifyOtpCode } = await import('@/lib/auth-ui');
      const { default: toast } = await import('react-hot-toast');
      await verifyOtpCode({ identifier: pendingOtp.identifier, purpose: pendingOtp.purpose, pin: otpPin });

      toast.success('Email verified. Completing sign-in...');

      if (!pendingExchange) {
        throw new Error('Sign-in session expired. Please try again.');
      }

      const { accessToken, mode: exchangeMode, role, referralCode, redirectTarget } = pendingExchange;
      setPendingOtp(null);
      setOtpPin('');
      setPendingExchange(null);
      await runExchange(accessToken, exchangeMode, role, referralCode, redirectTarget);
    } catch (err: unknown) {
      const { mapAuthMessage } = await import('@/lib/auth-ui');
      setOtpError(mapAuthMessage(err));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingOtp) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      const { resendOtpCode } = await import('@/lib/auth-ui');
      await resendOtpCode({ identifier: pendingOtp.identifier, purpose: pendingOtp.purpose });
      setOtpError('A new code has been sent.');
    } catch (err: unknown) {
      setOtpError((err as { message?: string })?.message || 'Unable to resend the code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const currentMode = mode;

  if (pendingOtp) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-black/5 shadow-xl space-y-5">
          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-600">
              <Fingerprint size={26} />
            </div>
            <h1 className="text-2xl font-bold">Verify your email to continue</h1>
             <p className="text-sm text-gray-500">
               An OTP-based account already exists for this email. Sign in is paused until you verify{' '}
               <span className="font-semibold text-gray-800">{pendingOtp.identifier}</span>.
             </p>
          </div>

           {otpError ? <p className="text-sm font-medium text-rose-600">{otpError}</p> : null}

          <OtpInput
            value={otpPin}
            onChange={setOtpPin}
            autoFocus
            ariaLabel="Email verification code"
            onComplete={(next) => {
              if (next.length === 6) {
                setOtpPin(next);
                void handleVerifyOtp();
              }
            }}
          />

          <button
            type="button"
            onClick={() => void handleVerifyOtp()}
            disabled={otpLoading || otpPin.length < 6}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {otpLoading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Verifying...
              </>
            ) : (
              'Verify and continue'
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleResendOtp()}
            disabled={otpLoading}
            className="w-full text-center text-sm font-semibold text-sky-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Resend code
          </button>

          <button
            type="button"
            onClick={() => {
              navigate('/', { replace: true });
              openAuth({ returnTo: pendingExchange?.redirectTarget || '/' });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <ArrowLeft size={16} />
            Back to LofiMart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-black/5 shadow-xl text-center space-y-4">
        {error ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertCircle size={26} />
            </div>
            <h1 className="text-2xl font-bold">{currentMode === 'register' ? 'Sign-up could not be completed' : 'Sign-in failed'}</h1>
            <p className="text-sm text-gray-500">{error}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  navigate('/', { replace: true });
                  openAuth({ returnTo: redirectTarget || '/' });
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <ArrowLeft size={16} />
                <span>Back to LofiMart</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin mx-auto" size={28} />
            <h1 className="text-2xl font-bold">{currentMode === 'register' ? 'Completing account setup' : 'Completing sign in'}</h1>
            <p className="text-sm text-gray-500">
              {currentMode === 'register'
                ? 'Please wait while we finish creating your account and secure your session.'
                : 'Please wait while we finish your Supabase login.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}