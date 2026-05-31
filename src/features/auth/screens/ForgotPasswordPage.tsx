import React, { useState } from 'react';
import { Link } from '@/src/lib/navigation';
import { ArrowRight, CheckCircle, Loader2, Mail } from 'lucide-react';
import { AuthAlert, AuthShell } from '@/src/components/auth/AuthUI';
import { getSupabaseBrowserClient, hasSupabaseBrowserEnv, mapAuthMessage } from '@/src/lib/auth-ui';

export const ForgotPasswordPage = () => {
  const supabaseReady = hasSupabaseBrowserEnv();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!supabaseReady) {
      setError('Supabase authentication is not configured for this environment yet.');
      return;
    }

    setLoading(true);
    try {
      const supabase = await getSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSubmitted(true);
    } catch (err: any) {
      setError(mapAuthMessage(err?.message ?? err ?? 'Unable to send a reset email right now.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Recover access to your account"
      subtitle="We will send a secure password reset link to your verified email so you can safely choose a new password."
      badgeLabel="Account Recovery"
      highlights={[
        'Reset links are sent to your verified email address',
        'Your existing account data and role stay unchanged',
        'After resetting, you can sign in immediately with the new password',
      ]}
      asideTitle="What happens next"
    >
      <div className="space-y-8">
        {!submitted ? (
          <>
            <div className="space-y-3 text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                Password recovery
              </span>
              <div>
                <h2 className="text-3xl font-bold text-slate-950 font-display">Forgot password?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Enter the email address linked to your account and we&apos;ll send you a secure reset link.
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
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
                  placeholder="Email address"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                For security, the reset link expires automatically. If you don&apos;t see the email, check spam or promotions.
              </div>

              <button
                type="submit"
                disabled={loading || !supabaseReady}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>Sending reset link...</span>
                  </>
                ) : (
                  <>
                    <span>Send reset link</span>
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
              <h2 className="text-2xl font-bold text-slate-950">Check your email</h2>
              <p className="text-sm leading-6 text-slate-500">
                We&apos;ve sent a password reset link to <span className="font-semibold text-slate-900">{email}</span>.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Open the link from your inbox on this device for the smoothest reset experience.
            </div>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="font-semibold text-primary transition hover:text-primary/80"
            >
              Didn&apos;t receive the email? Try again
            </button>
          </div>
        )}

        <p className="text-center text-sm text-slate-600 lg:text-left">
          Remember your password?{' '}
          <Link to="/login" className="font-bold text-primary hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
};
