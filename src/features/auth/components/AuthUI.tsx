'use client';

import React from 'react';
import {
  Eye,
  EyeOff,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';

type AuthAlertTone = 'error' | 'warning' | 'success' | 'info';

const AUTH_PANEL_IMAGE =
  'https://images.unsplash.com/photo-1607082350899-7e105aa886ae?auto=format&fit=crop&w=1200&q=80';

const alertStyles: Record<AuthAlertTone, string> = {
  error:
    'border-rose-400/30 bg-rose-500/10 text-rose-100',
  warning:
    'border-amber-400/30 bg-amber-500/10 text-amber-100',
  success:
    'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  info:
    'border-sky-400/30 bg-sky-500/10 text-sky-100',
};

type AuthShellProps = {
  title: string;
  subtitle: string;
  highlights: string[];
  asideTitle: string;
  badgeLabel?: string;
  children: React.ReactNode;
};

export function AuthShell({
  title,
  subtitle,
  highlights,
  asideTitle,
  badgeLabel = 'Secure Commerce Access',
  children,
}: AuthShellProps) {
  return (
    <main
      className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#070816] px-4 py-6 text-white sm:py-10"
      aria-labelledby="auth-shell-title"
    >
      {/* Background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(124,58,237,0.34),transparent_30%),radial-gradient(circle_at_82%_70%,rgba(217,70,239,0.28),transparent_34%),radial-gradient(circle_at_55%_20%,rgba(14,165,233,0.16),transparent_28%),linear-gradient(135deg,#070816_0%,#111137_48%,#170a2c_100%)]"
      />

      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-fuchsia-500/20 to-transparent"
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-stretch gap-6 md:min-h-[720px] md:grid-cols-[1fr_0.92fr]">
        {/* Desktop information panel */}
        <section
          aria-label="LofiMart security information"
          className="relative hidden overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl md:flex md:flex-col md:justify-between"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_20%_85%,rgba(124,58,237,0.32),transparent_30%),radial-gradient(circle_at_82%_42%,rgba(56,189,248,0.12),transparent_32%)]"
          />

          <div className="relative space-y-6">
            {/* Brand */}
            <div className="flex items-center gap-2 text-lg font-bold">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500 text-white shadow-lg shadow-violet-500/30"
              >
                <ShoppingBag size={18} />
              </span>

              <span>LofiMart</span>
            </div>

            {/* Heading */}
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                <ShieldCheck
                  aria-hidden="true"
                  size={14}
                />

                {badgeLabel}
              </span>

              <h1
                id="auth-shell-title"
                className="max-w-lg font-display text-4xl font-bold leading-tight"
              >
                {title}
              </h1>

              <p className="max-w-md text-base leading-7 text-slate-300">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="relative space-y-5 pt-8">
            {/* Highlights */}
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">
                {asideTitle}
              </p>

              {highlights.length > 0 && (
                <ul className="mt-4 space-y-3">
                  {highlights.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3 text-sm text-slate-300"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-200"
                      >
                        <ShieldCheck size={14} />
                      </span>

                      <span className="leading-6">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Image */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-purple-950/50">
              <img
                src={AUTH_PANEL_IMAGE}
                alt="LofiMart online shopping and secure checkout"
                loading="lazy"
                decoding="async"
                className="h-56 w-full object-cover opacity-90"
              />

              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#070816] via-transparent to-transparent"
              />

              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm backdrop-blur-md">
                <span className="font-semibold text-white">
                  Trusted by 10,000+ customers
                </span>

                <span
                  aria-hidden="true"
                  className="rounded-full bg-violet-500 px-3 py-1 text-xs font-bold text-white"
                >
                  +
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Authentication content */}
        <section
          aria-label="Authentication form"
          className="w-full rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl md:mx-auto md:max-w-[420px] md:p-8"
        >
          {children}
        </section>
      </div>
    </main>
  );
}

type AuthAlertProps = {
  tone: AuthAlertTone;
  children: React.ReactNode;
};

export function AuthAlert({
  tone,
  children,
}: AuthAlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={[
        'rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-sm',
        'leading-6',
        alertStyles[tone],
      ].join(' ')}
    >
      {children}
    </div>
  );
}

type InputFieldProps = {
  icon: React.ReactNode;
  type: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  label?: string;
  autoFocus?: boolean;
  minLength?: number;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  children?: React.ReactNode;
};

export function InputField({
  icon,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  disabled = false,
  id,
  name,
  label,
  autoFocus = false,
  minLength,
  maxLength,
  inputMode,
  children,
}: InputFieldProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <div className="relative">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm font-medium text-slate-200"
        >
          {label}
        </label>
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
      >
        {icon}
      </div>

      <input
        id={inputId}
        name={name}
        type={type}
        required={required}
        disabled={disabled}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        minLength={minLength}
        maxLength={maxLength}
        inputMode={inputMode}
        aria-label={!label ? placeholder : undefined}
        placeholder={placeholder}
        className={[
          'w-full rounded-xl border border-white/10',
          'bg-white/[0.04] py-3 pl-12 pr-12',
          'text-sm text-white outline-none transition',
          'placeholder:text-slate-500',
          'focus:border-violet-400/60',
          'focus:bg-white/[0.08]',
          'focus:ring-4 focus:ring-violet-500/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      />

      {children}
    </div>
  );
}

type PasswordVisibilityButtonProps = {
  visible: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
};

export function PasswordVisibilityButton({
  visible,
  onClick,
  label,
  disabled = false,
}: PasswordVisibilityButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={visible}
      className={[
        'absolute right-4 top-1/2 -translate-y-1/2',
        'rounded-md p-1 text-slate-400 transition-colors',
        'hover:text-violet-200',
        'focus:outline-none focus:ring-2 focus:ring-violet-400/60',
        'disabled:cursor-not-allowed disabled:opacity-50',
      ].join(' ')}
    >
      {visible ? (
        <EyeOff
          aria-hidden="true"
          size={18}
        />
      ) : (
        <Eye
          aria-hidden="true"
          size={18}
        />
      )}
    </button>
  );
}