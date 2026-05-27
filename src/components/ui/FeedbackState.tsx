'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  tone?: 'default' | 'soft' | 'danger';
};

const toneClassNames: Record<NonNullable<EmptyStateProps['tone']>, string> = {
  default: 'border-black/5 bg-white',
  soft: 'border-slate-200 bg-slate-50/80',
  danger: 'border-rose-200 bg-rose-50',
};

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
  tone = 'default',
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'surface-card px-6 py-14 text-center md:px-8 md:py-18',
        toneClassNames[tone],
        className,
      )}
    >
      {icon ? (
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
          {icon}
        </div>
      ) : null}
      <h2 className="text-xl font-bold tracking-tight text-slate-950 md:text-2xl">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p> : null}
      {actions ? <div className="mt-7 flex flex-wrap justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

type CenteredLoaderProps = {
  label?: string;
  className?: string;
};

export function CenteredLoader({ label = 'Loading...', className }: CenteredLoaderProps) {
  return (
    <div className={cn('flex min-h-[280px] flex-col items-center justify-center gap-3', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}

type FormNoticeProps = {
  tone?: 'error' | 'success' | 'info';
  children: React.ReactNode;
  className?: string;
};

const formNoticeStyles: Record<NonNullable<FormNoticeProps['tone']>, string> = {
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
};

const formNoticeIcons: Record<NonNullable<FormNoticeProps['tone']>, React.ReactNode> = {
  error: <AlertCircle className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

export function FormNotice({ tone = 'info', children, className }: FormNoticeProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm font-medium',
        formNoticeStyles[tone],
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{formNoticeIcons[tone]}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default EmptyState;
