'use client';

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../../../lib/navigation';
import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { useUser } from '../../../features/shared/state/UserContext';

function normalizeRedirectTarget(value: string | null) {
  if (!value || !value.startsWith('/')) {
    return null;
  }

  return value;
}

function resolvePostAuthDestination(userRole: string, redirectTarget: string | null) {
  if (redirectTarget) return redirectTarget;
  if (userRole === 'admin') return '/admin/dashboard';
  if (userRole === 'seller') return '/seller/dashboard';
  if (userRole === 'reseller') return '/reseller-dashboard/overview';
  return '/account/dashboard';
}

function getHashParams() {
  if (typeof window === 'undefined' || !window.location.hash) {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useUser();
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    let cancelled = false;
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
        const [{ createClient, hasSupabaseBrowserEnv }, { exchangeSupabaseSession, mapAuthMessage }, { default: toast }] = await Promise.all([
          import('@/lib/client'),
          import('@/lib/auth-ui'),
          import('react-hot-toast'),
        ]);

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

        if (currentMode === 'register' && !role) {
          throw new Error('Please select whether you are joining as a customer, seller, or reseller before using social sign up.');
        }

        const payload = await exchangeSupabaseSession({
          accessToken,
          role,
          referralCode,
          mode: currentMode,
          name: session.user.user_metadata?.name || session.user.user_metadata?.full_name,
        });

        if (cancelled) {
          return;
        }

        login(payload.user, payload.token, payload.refreshToken);
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
        navigate(resolvePostAuthDestination(payload.user.role, redirectTarget), { replace: true });
      } catch (err: any) {
        if (!cancelled) {
          const { mapAuthMessage } = await import('@/lib/auth-ui');
          setError(mapAuthMessage(err.message || 'Authentication failed'));
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [login, navigate, searchParams]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-black/5 shadow-xl text-center space-y-4">
        {error ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertCircle size={26} />
            </div>
            <h1 className="text-2xl font-bold">{mode === 'register' ? 'Sign-up could not be completed' : 'Sign-in failed'}</h1>
            <p className="text-sm text-gray-500">{error}</p>
            <div className="pt-2">
              <Link
                to={mode === 'register' ? '/register' : '/login'}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <ArrowLeft size={16} />
                <span>{mode === 'register' ? 'Back to register' : 'Back to login'}</span>
              </Link>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin mx-auto" size={28} />
            <h1 className="text-2xl font-bold">{mode === 'register' ? 'Completing account setup' : 'Completing sign in'}</h1>
            <p className="text-sm text-gray-500">
              {mode === 'register'
                ? 'Please wait while we finish creating your account and secure your session.'
                : 'Please wait while we finish your Supabase login.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
