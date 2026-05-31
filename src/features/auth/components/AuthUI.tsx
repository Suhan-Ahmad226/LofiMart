import React from 'react';
import { Eye, EyeOff, ShieldCheck, ShoppingBag } from 'lucide-react';

type AuthAlertTone = 'error' | 'warning' | 'success';
const AUTH_PANEL_IMAGE =
  'https://images.unsplash.com/photo-1607082350899-7e105aa886ae?auto=format&fit=crop&w=1200&q=80';

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
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-[#070816] px-4 py-6 text-white sm:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(124,58,237,0.34),transparent_30%),radial-gradient(circle_at_82%_70%,rgba(217,70,239,0.28),transparent_34%),radial-gradient(circle_at_55%_20%,rgba(14,165,233,0.16),transparent_28%),linear-gradient(135deg,#070816_0%,#111137_48%,#170a2c_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-fuchsia-500/20 to-transparent" />
      <div className="relative mx-auto grid max-w-6xl items-stretch gap-6 lg:min-h-[720px] lg:grid-cols-[1fr_0.92fr]">
        <div className="relative hidden overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_85%,rgba(124,58,237,0.32),transparent_30%),radial-gradient(circle_at_82%_42%,rgba(56,189,248,0.12),transparent_32%)]" />
          <div className="space-y-6">
            <div className="relative flex items-center gap-2 text-lg font-bold">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500 text-white shadow-lg shadow-violet-500/30">
                <ShoppingBag size={18} />
              </span>
              <span>LofiMart</span>
            </div>
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                <ShieldCheck size={14} />
                {badgeLabel}
              </span>
              <h1 className="max-w-lg text-4xl font-bold leading-tight font-display">{title}</h1>
              <p className="max-w-md text-base leading-7 text-slate-300">{subtitle}</p>
            </div>
          </div>

          <div className="relative space-y-5 pt-8">
            <div className="rounded-3xl border border-white/10 bg-black/20 p-5 backdrop-blur-sm">
              <p className="text-sm font-semibold text-white">{asideTitle}</p>
              <div className="mt-4 space-y-3">
                {highlights.map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-slate-300">
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/15 text-fuchsia-200">
                      <ShieldCheck size={14} />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-purple-950/50">
              <img
                src={AUTH_PANEL_IMAGE}
                alt="LofiMart shopping and secure checkout"
                className="h-56 w-full object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070816] via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm backdrop-blur-md">
                <span className="font-semibold text-white">Trusted by 10,000+ customers</span>
                <span className="rounded-full bg-violet-500 px-3 py-1 text-xs font-bold text-white">+</span>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AuthAlert({ tone, children }: { tone: AuthAlertTone; children: React.ReactNode }) {
  const styles = {
    error: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    warning: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
    success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
  }[tone];

  return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium backdrop-blur-sm ${styles}`}>{children}</div>;
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
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-12 pr-12 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400/60 focus:bg-white/[0.08] focus:ring-4 focus:ring-violet-500/15"
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
      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-violet-200"
      aria-label={label}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
