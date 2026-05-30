import React from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';

type AuthAlertTone = 'error' | 'warning' | 'success';
const AUTH_PANEL_IMAGE =
  'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&q=80';

export function AuthShell({
  title,
  subtitle,
  highlights,
  asideTitle,
  badgeLabel = 'Secure Commerce Access',
  children,
}: {
  title: string;
  subtitle: string;
  highlights: string[];
  asideTitle: string;
  badgeLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[80vh] overflow-hidden px-4 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.12),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_34%),linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)]" />
      <div className="mx-auto grid max-w-6xl items-stretch gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 p-8 text-white shadow-2xl lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/80">
              <ShieldCheck size={14} />
              {badgeLabel}
            </span>
            <div className="space-y-4">
              <h1 className="max-w-lg text-4xl font-bold leading-tight font-display">{title}</h1>
              <p className="max-w-xl text-base leading-7 text-slate-300">{subtitle}</p>
            </div>
          </div>

          <div className="space-y-5 pt-8">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-black/20">
              <img
                src={AUTH_PANEL_IMAGE}
                alt="Customer completing a secure LofiMart checkout"
                className="h-52 w-full object-cover"
              />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">{asideTitle}</p>
              <div className="mt-4 space-y-3">
                {highlights.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                      <ShieldCheck size={14} />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="w-full rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-sm sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthAlert({ tone, children }: { tone: AuthAlertTone; children: React.ReactNode }) {
  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[tone];

  return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${styles}`}>{children}</div>;
}

export function InputField({
  icon,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  children,
}: {
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>
      <input
        type={type}
        required={required}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-4 focus:ring-primary/10"
        placeholder={placeholder}
      />
      {children}
    </div>
  );
}

export function PasswordVisibilityButton({
  visible,
  onClick,
  label,
}: {
  visible: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-primary"
      aria-label={label}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
