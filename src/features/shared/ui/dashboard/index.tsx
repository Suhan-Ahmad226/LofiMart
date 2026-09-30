'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type DashboardHeaderProps = {
  title: string;
  description?: string;
  greeting?: string;
  className?: string;
  actions?: React.ReactNode;
};

export function DashboardHeader({ title, description, greeting, className, actions }: DashboardHeaderProps) {
  return (
    <div className={cn('rounded-2xl border border-black/5 bg-white p-6 shadow-sm', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {greeting ? <p className="text-sm font-medium text-primary">{greeting}</p> : null}
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

type DashboardSectionProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function DashboardSection({ title, description, action, children, className }: DashboardSectionProps) {
  return (
    <section className={cn('rounded-2xl border border-black/5 bg-white shadow-sm', className)}>
      <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-slate-950">{title}</h3>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

type DashboardKpiCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    tone: 'good' | 'neutral' | 'warning';
  };
  className?: string;
};

const trendStyles: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-600',
  warning: 'bg-amber-50 text-amber-700',
};

export function DashboardKpiCard({ label, value, helper, icon, trend, className }: DashboardKpiCardProps) {
  return (
    <div className={cn('rounded-2xl border border-black/5 bg-white p-5 shadow-sm transition hover:-translate-y-0.5', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2.5 text-2xl font-bold text-slate-950">{value}</p>
          {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            {icon}
          </div>
        ) : null}
      </div>
      {trend ? (
        <div className="mt-4">
          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-bold', trendStyles[trend.tone] || trendStyles.neutral)}>
            {trend.value}
          </span>
        </div>
      ) : null}
    </div>
  );
}

type DashboardAlertProps = {
  title: string;
  description: string;
  tone?: 'info' | 'warning' | 'critical' | 'success';
  action?: React.ReactNode;
  className?: string;
};

const alertStyles: Record<string, string> = {
  info: 'border-sky-200 bg-sky-50',
  warning: 'border-amber-200 bg-amber-50',
  critical: 'border-rose-200 bg-rose-50',
  success: 'border-emerald-200 bg-emerald-50',
};

const alertIconStyles: Record<string, string> = {
  info: 'text-sky-600',
  warning: 'text-amber-600',
  critical: 'text-rose-600',
  success: 'text-emerald-600',
};

export function DashboardAlert({ title, description, tone = 'info', action, className }: DashboardAlertProps) {
  return (
    <div className={cn('rounded-2xl border p-4', alertStyles[tone], className)}>
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 shrink-0', alertIconStyles[tone])}>
          <AlertIcon tone={tone} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function AlertIcon({ tone }: { tone: string }) {
  switch (tone) {
    case 'critical':
      return <AlertTriangle size={18} />;
    case 'success':
      return <CheckCircle2 size={18} />;
    case 'warning':
      return <AlertTriangle size={18} />;
    default:
      return <Info size={18} />;
  }
}

type DashboardStatsGridProps = {
  children: React.ReactNode;
  className?: string;
  columns?: 2 | 3 | 4 | 5 | 6;
};

export function DashboardStatsGrid({ children, className, columns = 4 }: DashboardStatsGridProps) {
  const gridCols: Record<number, string> = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
  };

  return <div className={cn('grid gap-5', gridCols[columns], className)}>{children}</div>;
}
