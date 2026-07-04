import React from 'react';

type SellerPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
};

export function SellerPageHeader({ eyebrow, title, description, actions }: SellerPageHeaderProps) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm">
      <div className="bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_30%),linear-gradient(135deg,rgba(42,133,255,0.10),rgba(15,23,42,0.02))] px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary/70">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}

type SellerStatCardProps = {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'critical' | 'warning' | 'success';
};

export function SellerStatCard({ label, value, tone = 'default' }: SellerStatCardProps) {
  const toneClass =
    tone === 'critical'
      ? 'border-rose-100 bg-rose-50'
      : tone === 'warning'
        ? 'border-amber-100 bg-amber-50'
        : tone === 'success'
          ? 'border-emerald-100 bg-emerald-50'
          : 'border-black/5 bg-white';

  const labelClass =
    tone === 'critical'
      ? 'text-rose-500'
      : tone === 'warning'
        ? 'text-amber-500'
        : tone === 'success'
          ? 'text-emerald-500'
          : 'text-slate-500';

  const valueClass =
    tone === 'critical'
      ? 'text-rose-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'success'
          ? 'text-emerald-700'
          : 'text-slate-950';

  return (
    <div className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}>
      <p className={`text-xs font-bold uppercase tracking-[0.18em] ${labelClass}`}>{label}</p>
      <p className={`mt-2 text-3xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

type SellerEmptyStateProps = {
  message: string;
  action?: React.ReactNode;
};

export function SellerEmptyState({ message, action }: SellerEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
      <p>{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
