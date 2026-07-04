'use client';

import React from 'react';

type MetricPayload = {
  name: string;
  value: number;
  id?: string;
  rating?: 'good' | 'needs-improvement' | 'poor';
  route: string;
  url: string;
  referrer: string;
  userAgent: string;
  ts: number;
};

function rateMetric(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  switch (name) {
    case 'LCP':
      if (value <= 2500) return 'good';
      if (value <= 4000) return 'needs-improvement';
      return 'poor';
    case 'CLS':
      if (value <= 0.1) return 'good';
      if (value <= 0.25) return 'needs-improvement';
      return 'poor';
    case 'FCP':
      if (value <= 1800) return 'good';
      if (value <= 3000) return 'needs-improvement';
      return 'poor';
    case 'TTFB':
      if (value <= 800) return 'good';
      if (value <= 1800) return 'needs-improvement';
      return 'poor';
    case 'INP':
      if (value <= 200) return 'good';
      if (value <= 500) return 'needs-improvement';
      return 'poor';
    default:
      return 'good';
  }
}

function sendMetric(metric: MetricPayload) {
  const body = JSON.stringify(metric);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon('/api/analytics/web-vitals', blob);
    return;
  }

  void fetch('/api/analytics/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export default function PerformanceMonitor() {
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return;
    }

    const route = window.location.pathname;
    const baseMeta = {
      route,
      url: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
    };

    let lcpValue = 0;
    let clsValue = 0;
    let inpValue = 0;
    let fcpSent = false;
    let ttfbSent = false;

    const observers: PerformanceObserver[] = [];

    const report = (name: string, value: number, id?: string) => {
      sendMetric({
        name,
        value,
        id,
        rating: rateMetric(name, value),
        ...baseMeta,
        ts: Date.now(),
      });
    };

    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          lcpValue = lastEntry.startTime;
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      observers.push(lcpObserver);
    } catch {}

    try {
      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as Array<PerformanceEntry & { value?: number; hadRecentInput?: boolean }>) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value ?? 0;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      observers.push(clsObserver);
    } catch {}

    try {
      const paintObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === 'first-contentful-paint' && !fcpSent) {
            fcpSent = true;
            report('FCP', entry.startTime, entry.name);
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });
      observers.push(paintObserver);
    } catch {}

    try {
      const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const navigationEntry = navEntries[0];
      if (navigationEntry && !ttfbSent) {
        ttfbSent = true;
        report('TTFB', navigationEntry.responseStart, navigationEntry.name || 'navigation');
      }
    } catch {}

    try {
      const eventObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries() as Array<PerformanceEntry & { duration?: number }>;
        for (const entry of entries) {
          inpValue = Math.max(inpValue, entry.duration ?? 0);
        }
      });
      eventObserver.observe({ type: 'event', buffered: true } as PerformanceObserverInit);
      observers.push(eventObserver);
    } catch {}

    const flush = () => {
      if (lcpValue > 0) {
        report('LCP', lcpValue, 'largest-contentful-paint');
        lcpValue = 0;
      }
      if (clsValue > 0) {
        report('CLS', Number(clsValue.toFixed(4)), 'layout-shift');
        clsValue = 0;
      }
      if (inpValue > 0) {
        report('INP', inpValue, 'interaction-to-next-paint');
        inpValue = 0;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  return null;
}
