'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react';
import { cn } from './utils';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

type ToastAction = {
  label: string;
  onClick: () => void;
};

type ToastOptions = {
  id?: string;
  description?: React.ReactNode;
  duration?: number;
  action?: ToastAction;
  icon?: React.ReactNode;
  className?: string;
};

type ToastPosition = 'top-center' | 'top-right' | 'bottom-center' | 'bottom-right';

type ToasterProps = {
  position?: ToastPosition;
};

type ToastContent = string | React.ReactNode | { title?: string; description?: React.ReactNode };

type ToastItem = {
  id: string;
  type: ToastType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastAction;
  duration: number;
  createdAt: number;
  icon?: React.ReactNode;
  className?: string;
  dedupeKey?: string;
};

type ToastApi = ((content: ToastContent, options?: ToastOptions) => string) & {
  success: (content: ToastContent, options?: ToastOptions) => string;
  error: (content: ToastContent, options?: ToastOptions) => string;
  warning: (content: ToastContent, options?: ToastOptions) => string;
  info: (content: ToastContent, options?: ToastOptions) => string;
  loading: (content: ToastContent, options?: ToastOptions) => string;
  dismiss: (id?: string) => void;
  remove: (id?: string) => void;
  custom: (render: (t: { id: string; dismiss: () => void }) => React.ReactNode, options?: ToastOptions) => string;
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: ToastContent;
      success: ToastContent | ((data: T) => ToastContent);
      error: ToastContent | ((error: unknown) => ToastContent);
    },
    options?: ToastOptions,
  ) => Promise<T>;
};

const MAX_VISIBLE_TOASTS = 4;
const DEFAULT_DURATION_MS = 4200;

type ToastSnapshot = {
  visible: ToastItem[];
  queued: ToastItem[];
};

let listeners: Array<(snapshot: ToastSnapshot) => void> = [];
let toasts: ToastItem[] = [];
let queuedToasts: ToastItem[] = [];
const timers = new Map<string, { timeoutId: number; startedAt: number; remaining: number; paused: boolean }>();
const activeDedupeKeys = new Map<string, string>();
let counter = 0;

function notify() {
  const snapshot: ToastSnapshot = {
    visible: [...toasts],
    queued: [...queuedToasts],
  };

  listeners.forEach((listener) => listener(snapshot));
}

function resolveContent(content: ToastContent) {
  if (typeof content === 'string' || typeof content === 'number') {
    return content;
  }

  if (React.isValidElement(content)) {
    return content;
  }

  if (content && typeof content === 'object' && 'title' in content) {
    return content.title ?? '';
  }

  return '';
}

function createDedupeKey(type: ToastType, content: ToastContent, options?: ToastOptions) {
  const normalized = normalizeContent(content);
  const title = String(normalized.title ?? resolveContent(content) ?? '');
  const description = String(options?.description ?? normalized.description ?? '');
  return `${type}:${title}:${description}`.trim().toLowerCase();
}

export function getToastDedupeKey(type: ToastType, content: ToastContent, options?: ToastOptions) {
  return createDedupeKey(type, content, options);
}

function getToastThemeClasses(type: ToastType) {
  switch (type) {
    case 'success':
      return 'border-emerald-200/70 bg-white/95 text-slate-950 shadow-[0_22px_55px_-28px_rgba(16,185,129,0.55)] dark:border-emerald-500/30 dark:bg-slate-950/90 dark:text-slate-50';
    case 'error':
      return 'border-red-200/70 bg-white/95 text-slate-950 shadow-[0_22px_55px_-28px_rgba(239,68,68,0.5)] dark:border-red-500/30 dark:bg-slate-950/90 dark:text-slate-50';
    case 'warning':
      return 'border-orange-200/70 bg-white/95 text-slate-950 shadow-[0_22px_55px_-28px_rgba(249,115,22,0.48)] dark:border-orange-500/30 dark:bg-slate-950/90 dark:text-slate-50';
    case 'loading':
      return 'border-slate-200/80 bg-white/95 text-slate-950 shadow-[0_22px_55px_-30px_rgba(15,23,42,0.38)] dark:border-slate-700/70 dark:bg-slate-950/90 dark:text-slate-50';
    default:
      return 'border-blue-200/70 bg-white/95 text-slate-950 shadow-[0_22px_55px_-28px_rgba(59,130,246,0.5)] dark:border-blue-500/30 dark:bg-slate-950/90 dark:text-slate-50';
  }
}

function getToastAccentClasses(type: ToastType) {
  switch (type) {
    case 'success':
      return 'bg-emerald-500';
    case 'error':
      return 'bg-red-500';
    case 'warning':
      return 'bg-orange-500';
    case 'loading':
      return 'bg-slate-500';
    default:
      return 'bg-blue-500';
  }
}

function getToastIconClasses(type: ToastType) {
  switch (type) {
    case 'success':
      return 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20';
    case 'error':
      return 'bg-red-50 text-red-600 ring-red-100 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/20';
    case 'warning':
      return 'bg-orange-50 text-orange-600 ring-orange-100 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20';
    case 'loading':
      return 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';
    default:
      return 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/20';
  }
}

function getToastIcon(type: ToastType, fallback?: React.ReactNode) {
  if (fallback) return fallback;

  switch (type) {
    case 'success':
      return <CheckCircle2 className="h-5 w-5" />;
    case 'error':
      return <AlertCircle className="h-5 w-5" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5" />;
    case 'loading':
      return <LoaderCircle className="h-5 w-5 animate-spin" />;
    default:
      return <Info className="h-5 w-5" />;
  }
}

function clearTimer(id: string) {
  const timer = timers.get(id);
  if (!timer) return;
  if (typeof window !== 'undefined' && timer.timeoutId) {
    window.clearTimeout(timer.timeoutId);
  }
  timers.delete(id);
}

function startTimer(id: string, duration: number) {
  if (duration <= 0 || typeof window === 'undefined') return;

  const startedAt = Date.now();
  const timeoutId = window.setTimeout(() => {
    dismiss(id);
  }, duration);

  timers.set(id, { timeoutId, startedAt, remaining: duration, paused: false });
}

function pauseTimer(id: string) {
  const timer = timers.get(id);
  if (!timer || typeof window === 'undefined') return;

  if (timer.timeoutId) {
    window.clearTimeout(timer.timeoutId);
  }

  const elapsed = Date.now() - timer.startedAt;
  const remaining = Math.max(0, timer.remaining - elapsed);
  timers.set(id, { timeoutId: 0, startedAt: Date.now(), remaining, paused: true });
}

function resumeTimer(id: string) {
  const timer = timers.get(id);
  if (!timer || timer.remaining <= 0 || typeof window === 'undefined') return;

  const timeoutId = window.setTimeout(() => {
    dismiss(id);
  }, timer.remaining);

  timers.set(id, { timeoutId, startedAt: Date.now(), remaining: timer.remaining, paused: false });
}

function normalizeContent(content: ToastContent) {
  if (typeof content === 'string' || typeof content === 'number') {
    return { title: String(content), description: undefined as React.ReactNode | undefined };
  }

  if (content && typeof content === 'object' && 'title' in content) {
    return {
      title: content.title ?? '',
      description: content.description,
    };
  }

  return {
    title: content as React.ReactNode,
    description: undefined as React.ReactNode | undefined,
  };
}

function createToast(options: {
  type: ToastType;
  content: ToastContent;
  toastOptions?: ToastOptions;
}) {
  const resolved = normalizeContent(options.content);
  const duration = options.toastOptions?.duration ?? DEFAULT_DURATION_MS;
  const dedupeKey = createDedupeKey(options.type, options.content, options.toastOptions);

  if (dedupeKey && activeDedupeKeys.has(dedupeKey)) {
    return activeDedupeKeys.get(dedupeKey)!;
  }

  const id = options.toastOptions?.id ?? `toast-${++counter}`;

  const item: ToastItem = {
    id,
    type: options.type,
    title: resolved.title,
    description: options.toastOptions?.description ?? resolved.description,
    action: options.toastOptions?.action,
    duration,
    createdAt: Date.now(),
    icon: options.toastOptions?.icon,
    className: options.toastOptions?.className,
    dedupeKey,
  };

  if (toasts.length >= MAX_VISIBLE_TOASTS) {
    queuedToasts.push(item);
    if (dedupeKey) {
      activeDedupeKeys.set(dedupeKey, item.id);
    }
  } else {
    toasts.push(item);
    if (dedupeKey) {
      activeDedupeKeys.set(dedupeKey, item.id);
    }
    startTimer(item.id, item.duration);
  }

  notify();

  return item.id;
}

function flushQueue() {
  if (queuedToasts.length === 0 || toasts.length >= MAX_VISIBLE_TOASTS) return;

  const next = queuedToasts.shift();
  if (!next) return;

  toasts.push(next);
  if (next.dedupeKey) {
    activeDedupeKeys.set(next.dedupeKey, next.id);
  }
  startTimer(next.id, next.duration);
  notify();
}

export function dismissToast(id?: string) {
  if (!id) {
    toasts.forEach((toast) => clearTimer(toast.id));
    queuedToasts = [];
    toasts = [];
    activeDedupeKeys.clear();
    notify();
    return;
  }

  const fromVisible = toasts.findIndex((toast) => toast.id === id);
  if (fromVisible >= 0) {
    const toastToRemove = toasts[fromVisible];
    clearTimer(id);
    toasts.splice(fromVisible, 1);
    if (toastToRemove.dedupeKey && !queuedToasts.some((queued) => queued.dedupeKey === toastToRemove.dedupeKey)) {
      activeDedupeKeys.delete(toastToRemove.dedupeKey);
    }
    if (toasts.length < MAX_VISIBLE_TOASTS) {
      flushQueue();
    }
    notify();
    return;
  }

  const fromQueue = queuedToasts.findIndex((toast) => toast.id === id);
  if (fromQueue >= 0) {
    const toastToRemove = queuedToasts[fromQueue];
    queuedToasts.splice(fromQueue, 1);
    if (toastToRemove.dedupeKey && !toasts.some((visible) => visible.dedupeKey === toastToRemove.dedupeKey)) {
      activeDedupeKeys.delete(toastToRemove.dedupeKey);
    }
    notify();
  }
}

export function dismiss(id?: string) {
  dismissToast(id);
}

function createToastApi(): ToastApi {
  const api = ((content: ToastContent, options?: ToastOptions) => {
    return createToast({ type: 'info', content, toastOptions: options });
  }) as ToastApi;

  api.success = (content: ToastContent, options?: ToastOptions) => {
    return createToast({ type: 'success', content, toastOptions: options });
  };
  api.error = (content: ToastContent, options?: ToastOptions) => {
    return createToast({ type: 'error', content, toastOptions: options });
  };
  api.warning = (content: ToastContent, options?: ToastOptions) => {
    return createToast({ type: 'warning', content, toastOptions: options });
  };
  api.info = (content: ToastContent, options?: ToastOptions) => {
    return createToast({ type: 'info', content, toastOptions: options });
  };
  api.loading = (content: ToastContent, options?: ToastOptions) => {
    return createToast({ type: 'loading', content, toastOptions: { ...options, duration: 0 } });
  };
  api.dismiss = dismiss;
  api.remove = dismiss;
  api.custom = (render, options) => {
    const id = options?.id ?? `toast-${++counter}`;
    const item: ToastItem = {
      id,
      type: 'info',
      title: render({ id, dismiss: () => dismiss(id) }),
      description: '',
      duration: options?.duration ?? DEFAULT_DURATION_MS,
      createdAt: Date.now(),
      icon: options?.icon,
      className: options?.className,
    };
    if (toasts.length >= MAX_VISIBLE_TOASTS) {
      queuedToasts.push(item);
    } else {
      toasts.push(item);
      startTimer(item.id, item.duration);
    }
    notify();
    return id;
  };
  api.promise = async (promise, messages, options) => {
    const loadingId = api.loading(messages.loading ?? 'Working...', options);

    try {
      const result = await promise;
      dismiss(loadingId);
      const successMessage = typeof messages.success === 'function' ? messages.success(result) : messages.success;
      api.success(successMessage, options);
      return result;
    } catch (error) {
      dismiss(loadingId);
      const errorMessage = typeof messages.error === 'function' ? messages.error(error) : messages.error;
      api.error(errorMessage, options);
      throw error;
    }
  };

  return api;
}

const toast = createToastApi();

export function subscribe(listener: (snapshot: ToastSnapshot) => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((current) => current !== listener);
  };
}

export function Toaster({ position = 'top-right' }: ToasterProps = {}) {
  const [snapshot, setSnapshot] = React.useState<ToastSnapshot>({ visible: [], queued: [] });

  React.useEffect(() => {
    return subscribe(setSnapshot);
  }, []);

  const positionClasses = {
    'top-right': 'inset-x-0 top-3 sm:top-4 sm:right-4 sm:left-auto sm:items-end',
    'top-center': 'inset-x-0 top-3 sm:top-4 sm:left-1/2 sm:-translate-x-1/2',
    'bottom-right': 'inset-x-0 bottom-3 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end',
    'bottom-center': 'inset-x-0 bottom-3 sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2',
  }[position] ?? 'inset-x-0 top-3 sm:top-4 sm:right-4 sm:left-auto sm:items-end';

  return (
    <div className={cn('pointer-events-none fixed z-[110] flex flex-col items-center gap-3 px-3 sm:px-0', positionClasses)} aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false} mode="popLayout">
        {snapshot.visible.map((item) => {
          const icon = getToastIcon(item.type, item.icon);
          const toastClasses = cn(
            'pointer-events-auto relative flex min-h-[72px] w-full max-w-[92vw] items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3 shadow-xl ring-1 ring-black/[0.03] backdrop-blur-xl sm:max-w-[420px] sm:min-w-[320px] dark:ring-white/[0.05]',
            getToastThemeClasses(item.type),
            item.className,
          );

          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              role={item.type === 'error' ? 'alert' : 'status'}
              aria-live={item.type === 'error' ? 'assertive' : 'polite'}
              className={toastClasses}
              onMouseEnter={() => pauseTimer(item.id)}
              onMouseLeave={() => resumeTimer(item.id)}
              onFocus={() => pauseTimer(item.id)}
              onBlur={() => resumeTimer(item.id)}
            >
              <div aria-hidden className={cn('absolute bottom-0 left-0 top-0 w-1', getToastAccentClasses(item.type))} />
              <div className={cn('mt-0.5 flex-shrink-0 rounded-full p-1.5 ring-1', getToastIconClasses(item.type))}>
                {icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-5 tracking-normal">{item.title}</div>
                {item.description ? <div className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{item.description}</div> : null}
                {item.action ? (
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
                    onClick={() => {
                      item.action?.onClick();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close notification"
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={() => dismiss(item.id)}
              >
                <X className="h-4 w-4" />
              </button>
              {/* Progress bar (hidden for loading toasts) */}
              {item.type !== 'loading' ? <ToastProgress id={item.id} type={item.type} duration={item.duration} /> : null}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ToastProgress({ id, type, duration }: { id: string; type: ToastType; duration: number }) {
  const [progress, setProgress] = React.useState(1);

  React.useEffect(() => {
    let raf = 0 as number;
    let mounted = true;

    const tick = () => {
      const timer = timers.get(id);
      if (!timer || !mounted) {
        setProgress(0);
        return;
      }

      const original = duration;
      const elapsed = timer.paused ? 0 : Date.now() - timer.startedAt;
      const currentRemaining = Math.max(0, timer.remaining - elapsed);
      const pct = Math.max(0, Math.min(1, currentRemaining / original));
      setProgress(pct);

      if (pct > 0) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      mounted = false;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [id, duration]);

  return (
    <div className="absolute left-0 right-0 bottom-0 h-[3px] overflow-hidden rounded-b-2xl">
      <div className="h-full origin-left transform will-change-transform" style={{ transform: `scaleX(${progress})` }}>
        <div className={cn('h-full', getToastAccentClasses(type))} />
      </div>
    </div>
  );
}

export default toast;
