'use client';

import React, { useState } from 'react';
import { CheckCircle2, Circle, Eye, EyeOff, Lock, RefreshCw } from 'lucide-react';
import { getPasswordRuleState, getPasswordStrength } from '@/lib/auth-ui';

/**
 * Shared design tokens for the auth surfaces.
 *
 * Spacing, radius and touch targets follow the auth blueprint: 24px modal
 * padding, 48px controls, 12px control radius and a 44px minimum tap area.
 */
export const HEADING = 'text-[22px] font-bold leading-7 tracking-[-0.02em] text-[#131b2e] sm:text-[24px]';
export const BODY = 'text-[14px] leading-5 font-normal text-[#464555]';
export const LABEL = 'text-[13px] font-medium leading-5 text-[#131b2e]';
export const LABEL_SM = 'text-[10px] font-bold uppercase leading-3 tracking-[0.04em]';
export const MUTED = 'text-[12px] leading-4 tracking-[0.01em] text-[#464555]';

/**
 * Interactive rows that read as plain text but still need a full 44px touch
 * target on phones.
 */
export const TAP_TARGET = 'inline-flex min-h-11 items-center justify-center py-2';

/**
 * Secondary inline link (label row actions, view switches). The negative
 * margin keeps the compact look of the design while the 44px target stays.
 */
export const TAP_INLINE =
  '-my-2 inline-flex min-h-11 items-center px-0.5 text-[12px] font-semibold text-[#006c49] transition-colors hover:underline';

const IDENTITY_AUTOCOMPLETE = {
  autoCapitalize: 'none',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

const INPUT =
  'h-12 w-full rounded-xl bg-[#f2f6f4] px-3.5 text-[15px] leading-5 text-[#131b2e] outline-none transition-colors placeholder:text-[#6b7a75] hover:bg-[#eaf1ee] focus:bg-white focus:shadow-[0_1px_3px_rgba(19,27,46,0.14)] disabled:cursor-not-allowed disabled:opacity-60';

type FieldProps = {
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
};

export function Field({
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
}: FieldProps) {
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

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
  autoFocus?: boolean;
  name?: string;
  labelRight?: React.ReactNode;
  placeholder?: string;
};

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  disabled = false,
  autoFocus = false,
  name,
  labelRight,
  placeholder,
}: PasswordFieldProps) {
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
      placeholder={placeholder ?? (disabled ? 'Verify email first' : '••••••••')}
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
 * Live strength meter plus the policy checklist, so the user can see exactly
 * what the auth API will accept before submitting.
 */
export function PasswordChecklist({ password, withMeter = false }: { password: string; withMeter?: boolean }) {
  const strength = getPasswordStrength(password);

  return (
    <div className="mt-3 rounded-xl bg-[#f2f6f4] p-3">
      {withMeter && (
        <div aria-hidden="true" className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#d7e6de]">
          <div className={`h-full rounded-full transition-all duration-300 ${strength.tone} ${strength.width}`} />
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {getPasswordRuleState(password).map((rule) => (
          <li
            key={rule.id}
            className={`flex items-center gap-2 text-[13px] leading-5 ${rule.met ? 'text-[#131b2e]' : 'text-[#464555]'}`}
          >
            {rule.met ? (
              <CheckCircle2 size={16} className="shrink-0 text-[#006c49]" />
            ) : (
              <Circle size={16} className="shrink-0 text-[#7a8a85]" />
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
 * cooldown, so the timer only informs while the button stays tappable.
 */
export function ResendRow({
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
        <p className={`mt-3 text-center ${MUTED}`}>
          Resend code in <span className="font-semibold text-[#006c49]">{secondsLeft}s</span>
        </p>
      ) : null}

      <div className="mt-1 flex flex-col items-center gap-1">
        <span className={MUTED}>Didn&apos;t receive it?</span>
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className="inline-flex min-h-11 w-full max-w-[240px] items-center justify-center gap-1.5 rounded-xl bg-[#e6f4ec] px-4 text-[15px] font-semibold text-[#005b3d] transition-colors hover:bg-[#d8ecdf] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006c49]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={`shrink-0 ${loading ? 'animate-spin' : ''}`} />
          Resend code
        </button>
      </div>

    </>
  );
}

export function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63Z" />
      <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
    </svg>
  );
}