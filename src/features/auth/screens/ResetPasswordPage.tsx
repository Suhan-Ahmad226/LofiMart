import React, { useMemo, useState } from 'react';
import { useSearchParams, Link } from '../../../lib/navigation';
import { ArrowRight, CheckCircle, Loader2, Lock } from 'lucide-react';
import { AuthAlert, AuthShell, PasswordVisibilityButton } from '../../../components/auth/AuthUI';
import { getPasswordStrength, getSupabaseBrowserClient, hasSupabaseBrowserEnv, mapAuthMessage } from '../../../lib/auth-ui';

export const ResetPasswordPage = () => {
  const supabaseReady = hasSupabaseBrowserEnv();
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') || '';
  const [token] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
    } catch (err: any) {
      setError(mapAuthMessage(err?.message ?? err ?? 'Unable to update password right now.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Choose a fresh, secure password"
      subtitle="Reset your password safely and get back into your customer, seller, reseller, or admin workspace without losing any account data."
      badgeLabel="Secure Password Reset"
      highlights={[
        'Use a password with at least 8 characters',
        'Add uppercase letters, numbers, and symbols for stronger protection',
        'Once saved, your old password will stop working immediately',
      ]}
      asideTitle="Reset best practices"
    >
      <div className="space-y-8">
        {!done ? (
          <>
            <div className="space-y-3 text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                Reset access
              </span>
              <div>
                <h2 className="text-3xl font-bold text-slate-950 font-display">Reset password</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Enter a new password below. If you opened the reset link from your email, the secure Supabase session will be used automatically.
                </p>
              </div>
            </div>

            {!supabaseReady && (
              <AuthAlert tone="warning">
                Supabase auth is not configured. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to your `.env`.
              </AuthAlert>
            )}
            {error && <AuthAlert tone="error">{error}</AuthAlert>}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                {token ? (
                  <>Reset token detected from the recovery link. Your secure session is ready for password update.</>
                ) : (
                  <>No explicit token is shown here. If this page was opened from your reset email, Supabase will still use the recovery session automatically.</>
                )}
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    placeholder="New password"
                  />
                  <PasswordVisibilityButton
                    visible={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                    label={showPassword ? 'Hide password' : 'Show password'}
                  />
                </div>

                <div className="space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all ${strength.tone} ${strength.width}`} />
                  </div>
                  <p className="text-xs text-slate-500">{strength.label}. A stronger password helps protect orders, wallet activity, and account settings.</p>
                </div>

                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                    placeholder="Confirm password"
                  />
                  <PasswordVisibilityButton
                    visible={showConfirm}
                    onClick={() => setShowConfirm((value) => !value)}
                    label={showConfirm ? 'Hide password confirmation' : 'Show password confirmation'}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !supabaseReady}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Updating password...</span>
                  </>
                ) : (
                  <>
                    <span>Reset password</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-6 py-4 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-950">Password updated</h2>
              <p className="text-sm leading-6 text-slate-500">
                Your password has been updated successfully. You can now sign in with the new password.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              If you use this account on other devices, sign in again there with the new password.
            </div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Go to login <ArrowRight size={18} />
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
};

export default ResetPasswordPage;
