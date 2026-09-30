'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  KeyRound,
  Loader2,
  Mail,
  Phone,
} from 'lucide-react';
import { Link } from '../../../lib/navigation';
import {
  AuthAlert,
  AuthShell,
  PasswordVisibilityButton,
} from '@/features/auth/components/AuthUI';
import OtpInput from '@/features/auth/components/OtpInput';
import {
  getPasswordStrength,
  mapAuthMessage,
  requestPasswordReset,
  resendOtpCode,
  resetPasswordWithOtp,
  verifyOtpCode,
} from '../../../lib/auth-ui';

type RecoveryStep = 'identifier' | 'otp' | 'password' | 'success';

type RecoveryChannel = 'email' | 'phone' | 'unknown';

type VerifyOtpResult = {
  resetSession?: boolean;
  expiresInSeconds?: number;
};

type ResetPasswordResult = {
  success: true;
};

const OTP_LENGTH = 6;
const RESEND_FALLBACK_SECONDS = 60;

function detectIdentifierChannel(value: string): RecoveryChannel {
  const normalized = value.trim();

  if (!normalized) {
    return 'unknown';
  }

  if (normalized.includes('@')) {
    return 'email';
  }

  const digits = normalized.replace(/\D/g, '');

  if (
    /^01[3-9]\d{8}$/.test(digits) ||
    /^8801[3-9]\d{8}$/.test(digits)
  ) {
    return 'phone';
  }

  return 'unknown';
}

function getChannelIcon(channel: RecoveryChannel) {
  return channel === 'phone' ? Phone : Mail;
}

function getDeliveryMessage(_channel: RecoveryChannel) {
  return 'If an account matches, we\'ve sent a verification code.';
}

function getCodeLocationMessage(channel: RecoveryChannel) {
  switch (channel) {
    case 'email':
      return 'Check your email inbox, spam, or promotions folder.';

    case 'phone':
      return 'Check your phone for the verification code.';

    default:
      return 'Check the email or phone associated with your account.';
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? (error as { code: string }).code
    : '';

  switch (code) {
    case 'INVALID':
      return 'OTP সঠিক নয়। আবার চেষ্টা করুন।';
    case 'EXPIRED':
      return 'OTP-এর মেয়াদ শেষ হয়েছে। নতুন OTP পাঠান।';
    case 'MAX_ATTEMPTS':
      return 'অনেকবার ভুল OTP দেওয়া হয়েছে। নতুন OTP পাঠান।';
    case 'RATE_LIMITED':
      return 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ অপেক্ষা করুন।';
    case 'RESET_SESSION_INVALID':
    case 'INVALID_RESET':
      return 'Your verified reset session has expired. Please request a new code.';
    case 'PASSWORD_POLICY':
      return 'Use at least 8 characters with both letters and numbers.';
    case 'PASSWORD_SYNC_FAILED':
      return 'Your password could not be updated right now. Please try again.';
    case 'VALIDATION_ERROR':
      return fallback;
    default:
      break;
  }

  if (error instanceof Error) {
    return mapAuthMessage(error.message);
  }

  if (typeof error === 'string') {
    return mapAuthMessage(error);
  }

  return fallback;
}

export const ForgotPasswordPage = () => {
  const [step, setStep] = useState<RecoveryStep>('identifier');

  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [channel, setChannel] = useState<RecoveryChannel>('unknown');

  /**
   * The real reset credential is a server-issued HttpOnly cookie. This flag
   * only controls the current UI step after OTP verification succeeds.
   */
  const [resetSessionReady, setResetSessionReady] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const strength = useMemo(
    () => getPasswordStrength(newPassword),
    [newPassword],
  );

  const IdentifierIcon = useMemo(
    () => getChannelIcon(channel),
    [channel],
  );

  useEffect(() => {
    if (resendCooldown <= 0) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [resendCooldown]);

  const clearMessages = () => {
    setError('');
    setNotice('');
  };

  const handleIdentifierChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value;

    setIdentifier(value);
    setChannel(detectIdentifierChannel(value));

    setError('');
    setNotice('');
  };

  const handleSendCode = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    clearMessages();

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      setError(
        'Enter the email address or phone number linked to your account.',
      );
      return;
    }

    setLoading(true);

    try {
      const detectedChannel =
        detectIdentifierChannel(trimmedIdentifier);

      const result = await requestPasswordReset({
        identifier: trimmedIdentifier,
      });

      setIdentifier(trimmedIdentifier);
      setChannel(detectedChannel);

      setPin('');
      setResetSessionReady(false);

      setResendCooldown(
        typeof result?.resendInSeconds === 'number' &&
          result.resendInSeconds > 0
          ? result.resendInSeconds
          : RESEND_FALLBACK_SECONDS,
      );

      setStep('otp');
      setNotice(getDeliveryMessage(detectedChannel));
      setNotice(getDeliveryMessage(detectedChannel));
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          'Unable to send a reset code right now.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    clearMessages();

    if (pin.length !== OTP_LENGTH) {
      setError('Enter the complete 6-digit verification code.');
      return;
    }

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      setError(
        'Your recovery identifier is missing. Please start again.',
      );
      setStep('identifier');
      return;
    }

    setLoading(true);

    try {
      const result = (await verifyOtpCode({
        identifier: trimmedIdentifier,
        purpose: 'reset_password',
        pin,
      })) as VerifyOtpResult;

      if (result?.resetSession !== true) {
        throw new Error(
          'Password recovery authorization was not issued. Please request a new code.',
        );
      }

      setResetSessionReady(true);
      setPin('');
      setStep('password');

      setNotice(
        'Verification successful. Choose a new password for your account.',
      );
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'INVALID' || code === 'EXPIRED' || code === 'MAX_ATTEMPTS') {
        setPin('');
      }
      setError(
        getErrorMessage(
          err,
          'Unable to verify the code.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    clearMessages();

    if (!resetSessionReady) {
      setError(
        'Your recovery verification has expired. Please request a new code.',
      );
      setStep('otp');
      return;
    }

    if (newPassword.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }

    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Use a mix of letters and numbers for your new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const result = (await resetPasswordWithOtp({
        identifier: identifier.trim(),
        newPassword,
      })) as ResetPasswordResult;

      if (result?.success !== true) {
        throw new Error(
          'Unable to reset your password right now.',
        );
      }

      /*
       * Clear all recovery-sensitive client state immediately
       * after successful completion.
       */
      setResetSessionReady(false);
      setPin('');
      setNewPassword('');
      setConfirmPassword('');
      setResendCooldown(0);
      setStep('success');
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          'Unable to reset your password right now.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    clearMessages();

    const trimmedIdentifier = identifier.trim();

    if (!trimmedIdentifier) {
      setError(
        'Your recovery identifier is missing. Please start again.',
      );
      setStep('identifier');
      return;
    }

    if (loading || resendCooldown > 0) {
      return;
    }

    /*
     * A resend invalidates the previous OTP challenge.
     * Any previously issued recovery authorization is also discarded in the UI.
     * The server-side reset cookie naturally expires and is single-use.
     */
    setResetSessionReady(false);
    setPin('');

    setLoading(true);

    try {
      const result = await resendOtpCode({
        identifier: trimmedIdentifier,
        purpose: 'reset_password',
      });

      const seconds =
        typeof result?.resendInSeconds === 'number' &&
        result.resendInSeconds > 0
          ? result.resendInSeconds
          : RESEND_FALLBACK_SECONDS;

      setResendCooldown(seconds);

      setNotice(
        `A new verification code was sent. ${getCodeLocationMessage(channel)}`,
      );
    } catch (err: unknown) {
      setError(
        getErrorMessage(
          err,
          'Unable to resend the code right now.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChangeIdentifier = () => {
    clearMessages();

     setIdentifier('');
    setChannel('unknown');
    setPin('');
    setResetSessionReady(false);
    setNewPassword('');
    setConfirmPassword('');
    setResendCooldown(0);
    setStep('identifier');
  };

  const handleBackToOtp = () => {
    clearMessages();

    /*
     * Deliberately discard the recovery authorization state.
     * The user must complete a fresh OTP verification.
     */
    setResetSessionReady(false);
    setNewPassword('');
    setConfirmPassword('');
    setStep('otp');
  };

  const renderStepIndicator = () => {
    if (step === 'success') {
      return null;
    }

    const steps = [
      { key: 'identifier', label: 'Account' },
      { key: 'otp', label: 'Verify' },
      { key: 'password', label: 'Password' },
    ] as const;

    const currentIndex = steps.findIndex(
      (item) => item.key === step,
    );

    return (
      <nav
        className="mb-6"
        aria-label="Password recovery progress"
      >
        <ol className="flex items-center gap-2">
          {steps.map((item, index) => {
            const active = index <= currentIndex;
            const current = item.key === step;

            return (
              <React.Fragment key={item.key}>
                <li className="flex min-w-0 items-center gap-2">
                  <span
                    className={[
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition',
                      active
                        ? 'bg-violet-600 text-white'
                        : 'bg-white/10 text-slate-500',
                    ].join(' ')}
                    aria-current={
                      current ? 'step' : undefined
                    }
                  >
                    {index + 1}
                  </span>

                  <span
                    className={[
                      'hidden text-xs font-semibold sm:inline',
                      active
                        ? 'text-slate-200'
                        : 'text-slate-500',
                    ].join(' ')}
                  >
                    {item.label}
                  </span>
                </li>

                {index < steps.length - 1 && (
                  <li
                    aria-hidden="true"
                    className={[
                      'h-px flex-1 transition',
                      index < currentIndex
                        ? 'bg-violet-500'
                        : 'bg-white/10',
                    ].join(' ')}
                  />
                )}
              </React.Fragment>
            );
          })}
        </ol>
      </nav>
    );
  };

  return (
    <AuthShell
      title="Recover access to your account"
      subtitle="Verify your identity with a one-time code, then create a new password without losing your account data."
      badgeLabel="Account Recovery"
      highlights={[
        'A one-time verification code protects the recovery process',
        'Your existing account, orders, role, and profile remain unchanged',
        'Your new password replaces the old password after successful verification',
      ]}
      asideTitle="What happens next"
    >
      <main className="space-y-8">
        {renderStepIndicator()}

        {step === 'success' ? (
          <section
            className="space-y-6 py-4 text-center"
            aria-labelledby="password-updated-title"
          >
            <div
              className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
              aria-hidden="true"
            >
              <CheckCircle size={32} />
            </div>

            <div className="space-y-2">
              <h2
                id="password-updated-title"
                className="text-2xl font-bold text-white"
              >
                Password updated
              </h2>

              <p className="text-sm leading-6 text-slate-300">
                Your password has been updated successfully.
                You can now sign in using your new password.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
              If you use this account on other devices, sign in
              again there with the new password.
            </div>

            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500"
            >
              Go to login
              <ArrowRight size={18} />
            </Link>
          </section>
        ) : (
          <>
            {step === 'identifier' && (
              <section
                aria-labelledby="forgot-password-title"
                className="space-y-6"
              >
                <div className="space-y-3 text-center lg:text-left">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                    Password recovery
                  </span>

                  <div>
                    <h2
                      id="forgot-password-title"
                      className="font-display text-3xl font-bold text-white"
                    >
                      Forgot password?
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Enter the email address or phone number
                      linked to your account and we&apos;ll send
                      a one-time verification code.
                    </p>
                  </div>
                </div>

                {error && (
                  <AuthAlert tone="error">{error}</AuthAlert>
                )}

                <form
                  className="space-y-5"
                  onSubmit={handleSendCode}
                  noValidate
                >
                  <div className="relative">
                    <IdentifierIcon
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                      aria-hidden="true"
                    />

                    <label
                      htmlFor="recovery-identifier"
                      className="sr-only"
                    >
                      Email address or phone number
                    </label>

                    <input
                      id="recovery-identifier"
                      name="identifier"
                      type="text"
                      required
                      value={identifier}
                      onChange={handleIdentifierChange}
                      autoComplete="username"
                      inputMode={
                        channel === 'phone'
                          ? 'tel'
                          : 'email'
                      }
                      spellCheck={false}
                      aria-describedby="recovery-help"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-violet-500/15"
                      placeholder="Email address or phone number"
                    />
                  </div>

                  <div
                    id="recovery-help"
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300"
                  >
                    The verification code expires in 5 minutes.
                    For security, we do not reveal whether an
                    account exists.
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2
                          className="animate-spin"
                          size={18}
                          aria-hidden="true"
                        />
                        <span>Sending code...</span>
                      </>
                    ) : (
                      <>
                        <span>
                          Send verification code
                        </span>
                        <ArrowRight
                          size={18}
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </button>
                </form>
              </section>
            )}

            {step === 'otp' && (
              <section
                aria-labelledby="verify-code-title"
                className="space-y-6"
              >
                <div className="space-y-3 text-center lg:text-left">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                    Step 2 of 3
                  </span>

                  <div>
                    <h2
                      id="verify-code-title"
                      className="font-display text-3xl font-bold text-white"
                    >
                      Verify your code
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {getCodeLocationMessage(channel)}
                    </p>
                  </div>
                </div>

                {notice && (
                  <AuthAlert tone="success">
                    {notice}
                  </AuthAlert>
                )}

                {error && (
                  <AuthAlert tone="error">{error}</AuthAlert>
                )}

                 <form
                  className="space-y-6"
                  onSubmit={handleVerifyOtp}
                >
                  <div className="space-y-3">
                    <p
                      id="otp-help"
                      className="text-center text-sm text-slate-400"
                    >
                      Enter the 6-digit code. It expires in 5 minutes.
                    </p>

                    <OtpInput
                      value={pin}
                      onChange={(next) =>
                        setPin(
                          next
                            .replace(/\D/g, '')
                            .slice(0, OTP_LENGTH),
                        )
                      }
                      autoFocus
                      disabled={loading}
                      ariaLabel="Password reset verification code"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      loading || pin.length !== OTP_LENGTH
                    }
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2
                          className="animate-spin"
                          size={18}
                          aria-hidden="true"
                        />
                        <span>Verifying code...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify code</span>
                        <ArrowRight
                          size={18}
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </button>

                  <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={handleChangeIdentifier}
                      disabled={loading}
                      className="inline-flex items-center justify-center gap-2 font-semibold text-slate-400 transition hover:text-slate-200 disabled:opacity-60 sm:justify-start"
                    >
                      <ArrowLeft
                        size={16}
                        aria-hidden="true"
                      />
                      Change email or phone
                    </button>

                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={
                        loading || resendCooldown > 0
                      }
                      className="font-semibold text-fuchsia-300 transition hover:text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resendCooldown > 0
                        ? `Resend in ${resendCooldown}s`
                        : 'Resend code'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {step === 'password' && (
              <section
                aria-labelledby="new-password-title"
                className="space-y-6"
              >
                <div className="space-y-3 text-center lg:text-left">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                    Step 3 of 3
                  </span>

                  <div>
                    <h2
                      id="new-password-title"
                      className="font-display text-3xl font-bold text-white"
                    >
                      Choose a new password
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      Your identity has been verified. Create a
                      new password for your account.
                    </p>
                  </div>
                </div>

                {notice && (
                  <AuthAlert tone="success">
                    {notice}
                  </AuthAlert>
                )}

                {error && (
                  <AuthAlert tone="error">{error}</AuthAlert>
                )}

                <form
                  className="space-y-5"
                  onSubmit={handleResetPassword}
                >
                  <div className="relative">
                    <label
                      htmlFor="new-password"
                      className="sr-only"
                    >
                      New password
                    </label>

                    <KeyRound
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                      aria-hidden="true"
                    />

                    <input
                      id="new-password"
                      name="newPassword"
                      type={
                        showPassword ? 'text' : 'password'
                      }
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(event) =>
                        setNewPassword(event.target.value)
                      }
                      autoComplete="new-password"
                      aria-describedby="password-strength"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-violet-500/15"
                      placeholder="New password"
                    />

                    <PasswordVisibilityButton
                      visible={showPassword}
                      onClick={() =>
                        setShowPassword((value) => !value)
                      }
                      label={
                        showPassword
                          ? 'Hide password'
                          : 'Show password'
                      }
                    />
                  </div>

                  <div
                    id="password-strength"
                    className="space-y-2"
                    aria-live="polite"
                  >
                    <div
                      className="h-2 overflow-hidden rounded-full bg-white/10"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full rounded-full transition-all ${strength.tone} ${strength.width}`}
                      />
                    </div>

                    <p className="text-xs text-slate-400">
                      {strength.label}. Use a strong password to
                      protect your orders, wallet activity, and
                      account settings.
                    </p>
                  </div>

                  <div className="relative">
                    <label
                      htmlFor="confirm-password"
                      className="sr-only"
                    >
                      Confirm new password
                    </label>

                    <KeyRound
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                      size={18}
                      aria-hidden="true"
                    />

                    <input
                      id="confirm-password"
                      name="confirmPassword"
                      type={
                        showConfirmPassword
                          ? 'text'
                          : 'password'
                      }
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-violet-500/15"
                      placeholder="Confirm new password"
                    />

                    <PasswordVisibilityButton
                      visible={showConfirmPassword}
                      onClick={() =>
                        setShowConfirmPassword((value) => !value)
                      }
                      label={
                        showConfirmPassword
                          ? 'Hide password confirmation'
                          : 'Show password confirmation'
                      }
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      loading ||
                      !resetSessionReady ||
                      newPassword.length < 8 ||
                      confirmPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 transition hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2
                          className="animate-spin"
                          size={18}
                          aria-hidden="true"
                        />
                        <span>Updating password...</span>
                      </>
                    ) : (
                      <>
                        <span>Update password</span>
                        <ArrowRight
                          size={18}
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToOtp}
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-400 transition hover:text-slate-200 disabled:opacity-60"
                  >
                    <ArrowLeft
                      size={16}
                      aria-hidden="true"
                    />
                    Verify a different code
                  </button>
                </form>
              </section>
            )}
          </>
        )}

        {step !== 'success' && (
          <p className="text-center text-sm text-slate-400 lg:text-left">
            Remember your password?{' '}
            <Link
              to="/login"
              className="font-bold text-fuchsia-300 hover:underline"
            >
              Back to login
            </Link>
          </p>
        )}
      </main>
    </AuthShell>
  );
};

export default ForgotPasswordPage;
