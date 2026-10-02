'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Link, useLocation } from '../../../lib/navigation';
import { MessageCircle, ShieldCheck, Truck, Zap } from 'lucide-react';
import { Header, Footer, MobileBottomNav, ScrollToTopButton } from '@/features/shared/layout';
import PageTransition from '@/features/shared/animations/PageTransition';
import { NotificationContainer, useNotification } from '@/features/shared/animations/NotificationContainer';
import PWAInstallPrompt from '@/features/shared/pwa/PWAInstallPrompt';
import OfflineIndicator from '@/features/shared/pwa/OfflineIndicator';
import { Toaster } from '@/lib/toast';
import PageSkeleton from '@/features/shared/ui/PageSkeleton';
import { initOfflineStorage, offlineStorage } from '../../../utils/offlineStorage';
import { useUser } from '../../../features/shared/state/UserContext';
import SiteMotionEnhancer from '@/features/shared/animations/SiteMotionEnhancer';
import { useAuthModal } from '@/features/auth/context/AuthModalContext';
const CartRecoveryTracker = dynamic(() => import('@/features/shop/components/conversion/CartRecoveryTracker'), { ssr: false });
const ExitIntentOffer = dynamic(() => import('@/features/shop/components/conversion/ExitIntentOffer'), { ssr: false });
const PerformanceMonitor = dynamic(() => import('@/features/shared/analytics/PerformanceMonitor'), { ssr: false });



function HomeAnnouncementBar() {
  const { openAuth } = useAuthModal();
  return (
    <div className="relative z-50 border-b border-emerald-900/10 bg-slate-950 text-white">
      <div className="page-shell flex min-h-10 items-center justify-between gap-3 py-2 text-xs font-semibold">
        <div className="dashboard-chip-scroll flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
          <span className="inline-flex shrink-0 items-center gap-1.5 text-emerald-300">
            <Zap size={14} />
            Flash deals refresh daily
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-white/80">
            <Truck size={14} />
            Nationwide delivery
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-white/80">
            <ShieldCheck size={14} />
            Verified marketplace sellers
          </span>
        </div>
        <button type="button" onClick={() => openAuth({ returnTo: '/seller/onboarding' })} className="hidden shrink-0 text-emerald-300 hover:text-white sm:inline-flex">
          Sell on LofiMart
        </button>
      </div>
    </div>
  );
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { notifications, removeNotification } = useNotification();
  const [idleReady, setIdleReady] = React.useState(false);
  const [engagementReady, setEngagementReady] = React.useState(false);
  const [allowEnhancedGrowthLayer, setAllowEnhancedGrowthLayer] = React.useState(true);
  const [chatRequested, setChatRequested] = React.useState(false);

  const isOpsRoute =
    location.pathname.startsWith('/admin') ||
    location.pathname.startsWith('/seller') ||
    location.pathname.startsWith('/reseller-dashboard');
  const isAccountRoute = location.pathname.startsWith('/account');
  const showPublicChrome = !isOpsRoute;
  const showHomeAnnouncement = showPublicChrome && location.pathname === '/';

  const shouldLoadGrowthLayer = !isOpsRoute && !isAccountRoute && engagementReady && allowEnhancedGrowthLayer;
  const shouldLoadMotionLayer = !isOpsRoute && idleReady;
  const shouldLoadAnalytics = !isOpsRoute && idleReady;

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const scheduleEnhancements = () => {
      if (cancelled) return;
      setIdleReady(true);
      initOfflineStorage();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(scheduleEnhancements, { timeout: 1200 });
    } else {
      timeoutId = setTimeout(scheduleEnhancements, 300);
    }

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!idleReady || typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return;
    }

    let active = true;
    let controllerChanged = false;

    const handleControllerChange = () => {
      if (controllerChanged) return;
      controllerChanged = true;

      try {
        const reloadKey = 'lofimart-sw-controller-refreshed';
        if (!window.sessionStorage.getItem(reloadKey)) {
          window.sessionStorage.setItem(reloadKey, 'true');
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    };

    const registerServiceWorker = async () => {
      try {
        if ('caches' in window) {
          const keys = await window.caches.keys();
          await Promise.all(
            keys
              .filter((key) => key.startsWith('amarshop-'))
              .map((key) => window.caches.delete(key)),
          );
        }

        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await registration.update();

        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        registration.active?.postMessage({ type: 'CLEAR_OLD_CACHES' });
      } catch (error) {
        if (active && process.env.NODE_ENV !== 'production') {
          console.warn('Failed to register production service worker:', error);
        }
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    void registerServiceWorker();

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [idleReady]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const hasOAuthPayload =
      url.pathname === '/' &&
      (url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('error_description'));

    if (!hasOAuthPayload) {
      return;
    }

    const callbackParams = new URLSearchParams();
    ['code', 'error', 'error_description'].forEach((key) => {
      const value = url.searchParams.get(key);
      if (value) callbackParams.set(key, value);
    });

    try {
      const pendingRaw = window.sessionStorage.getItem('lofimart_pending_oauth');
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

      if (pending?.redirectTarget) callbackParams.set('redirect', pending.redirectTarget);
      if (pending?.role) callbackParams.set('role', pending.role);
      if (pending?.referralCode) callbackParams.set('ref', pending.referralCode);
      if (pending?.mode) callbackParams.set('mode', pending.mode);
    } catch {
      // If storage is unavailable, the callback can still complete a normal login.
    }

    window.location.replace(`/auth/callback?${callbackParams.toString()}`);
  }, []);

  React.useEffect(() => {
    if (!idleReady || typeof window === 'undefined') {
      return;
    }

    const syncOfflineQueue = () => {
      void offlineStorage.processQueue();
    };

    window.addEventListener('online', syncOfflineQueue);
    if (navigator.onLine) {
      syncOfflineQueue();
    }

    return () => {
      window.removeEventListener('online', syncOfflineQueue);
    };
  }, [idleReady]);

  React.useEffect(() => {
    if (engagementReady) return;
    if (typeof window === 'undefined') return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const enableEngagement = () => {
      setEngagementReady(true);
    };

    const onFirstIntent = () => {
      enableEngagement();
      window.removeEventListener('pointerdown', onFirstIntent);
      window.removeEventListener('keydown', onFirstIntent);
      window.removeEventListener('touchstart', onFirstIntent);
    };

    timerId = setTimeout(enableEngagement, allowEnhancedGrowthLayer ? 2600 : 4200);
    window.addEventListener('pointerdown', onFirstIntent, { passive: true });
    window.addEventListener('keydown', onFirstIntent);
    window.addEventListener('touchstart', onFirstIntent, { passive: true });

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
      window.removeEventListener('pointerdown', onFirstIntent);
      window.removeEventListener('keydown', onFirstIntent);
      window.removeEventListener('touchstart', onFirstIntent);
    };
  }, [allowEnhancedGrowthLayer, engagementReady]);

  React.useEffect(() => {
    if (typeof navigator === 'undefined') {
      return;
    }

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;

    if (!connection) {
      return;
    }

    const reduceEnhancements = connection.saveData || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
    const timerId = window.setTimeout(() => {
      setAllowEnhancedGrowthLayer(!reduceEnhancements);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  React.useEffect(() => {
    if (
      process.env.NODE_ENV !== 'development' ||
      typeof window === 'undefined' ||
      typeof navigator === 'undefined'
    ) {
      return;
    }

    const isLocalhost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (!isLocalhost || !('serviceWorker' in navigator)) {
      return;
    }

    const clearDevServiceWorkers = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Failed to clear dev service workers or caches:', error);
        }
      }
    };

    void clearDevServiceWorkers();
  }, []);

  const mainClassName = isOpsRoute
    ? 'site-main relative z-10 min-w-0 flex-grow overflow-x-clip bg-slate-50'
    : 'site-main relative z-10 min-w-0 flex-grow overflow-x-clip bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.06),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.98)_22%,rgba(240,244,254,0.6)_100%)]';

  const footerClassName = 'defer-visibility-auto md:pb-0 pb-[var(--bottom-nav-height)]';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground relative overflow-x-clip">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {shouldLoadMotionLayer ? <SiteMotionEnhancer /> : null}
      {showHomeAnnouncement ? <HomeAnnouncementBar /> : null}
      {showPublicChrome ? <Header /> : null}
      <main id="main-content" tabIndex={-1} className={mainClassName}>
        {/* Suspense is required by Next.js 15 for pages that call the built-in
            useSearchParams (via our useSearchParams) during static generation /
            client hydration. The page shells are client-fetched, so the fallback
            is an empty fragment while params resolve. */}
        <React.Suspense fallback={<div className="flex h-[50vh] items-center justify-center"><PageSkeleton variant="dashboard" /></div>}>
          <PageTransition type="fade" duration={0.55}>
            {children}
          </PageTransition>
        </React.Suspense>
      </main>
      <div className={footerClassName}>
        <Footer />
      </div>
      {showPublicChrome ? <MobileBottomNav /> : null}
      <ScrollToTopButton />
      <NotificationContainer notifications={notifications} onClose={removeNotification} />
      {idleReady ? (
        <>
          <PWAInstallPrompt />
          <OfflineIndicator />
          {shouldLoadAnalytics ? <PerformanceMonitor /> : null}
          {shouldLoadGrowthLayer ? (
            <>
              <CartRecoveryTracker />
              <ExitIntentOffer />
            </>
          ) : null}
        </>
      ) : null}
      <Toaster position="top-right" />
    </div>
  );
}
