import React from 'react';
import { Link } from '../../../lib/navigation';
import { ArrowRight, KeyRound } from 'lucide-react';
import { AuthShell } from '@/features/auth/components/AuthUI';

export const ResetPasswordPage = () => {
  return (
    <AuthShell
      title="Reset your password with a code"
      subtitle="Password reset now works with a one-time verification code instead of a link. Start from the recovery page and follow the steps."
      badgeLabel="Password Recovery"
      highlights={[
        'Reset codes are sent to your verified email address',
        'Your existing account data and role stay unchanged',
        'Once saved, your old password stops working immediately',
      ]}
      asideTitle="What changed"
    >
      <div className="space-y-8">
        <div className="space-y-3 text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
            Reset access
          </span>
          <div>
            <h2 className="text-3xl font-bold text-white font-display">Forgot your password?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              The reset link flow has been replaced with a safer code-based recovery. Enter your email or phone number and verify with a one-time code.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fuchsia-400/15 text-fuchsia-200">
            <KeyRound size={20} />
          </span>
          <p className="text-sm leading-6 text-slate-300">
            You can reset your password from the &ldquo;Forgot password?&rdquo; page. The whole process is covered there in three steps: request a code, verify it, and choose a new password.
          </p>
        </div>

        <Link
          to="/forgot-password"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500"
        >
          <span>Go to password recovery</span>
          <ArrowRight size={18} />
        </Link>

        <p className="text-center text-sm text-slate-400 lg:text-left">
          Remember your password?{' '}
          <Link to="/login" className="font-bold text-fuchsia-300 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </AuthShell>
  );
};

export default ResetPasswordPage;
