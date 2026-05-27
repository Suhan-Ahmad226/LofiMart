'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useLocation } from '@/src/lib/navigation';
import { MessageCircle } from 'lucide-react';
import { Header, Footer, MobileBottomNav, ScrollToTopButton } from './Layout';
import PageTransition from './animations/PageTransition';
import { NotificationContainer, useNotification } from './animations/NotificationContainer';
import PWAInstallPrompt from './PWAInstallPrompt';
import OfflineIndicator from './OfflineIndicator';
import { Toaster } from 'react-hot-toast';
import { initOfflineStorage, offlineStorage } from '../utils/offlineStorage';
import { useUser } from '../context/UserContext';
import SiteMotionEnhancer from './animations/SiteMotionEnhancer';
const ChatBot = dynamic(() => import('./ai/ChatBot'), { ssr: false });
const CartRecoveryTracker = dynamic(() => import('./conversion/CartRecoveryTracker'), { ssr: false });
const ExitIntentOffer = dynamic(() => import('./conversion/ExitIntentOffer'), { ssr: false });
const PerformanceMonitor = dynamic(() => import('./analytics/PerformanceMonitor'), { ssr: false });

function ChatBotWrapper() {
  const { user } = useUser();
  return <ChatBot userId={user?.id} userName={user?.name} initialOpen showLauncher={false} />;
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
    location.pathname.startsWith('/reseller-dashboard') ||
    location.pathname.startsWith('/account');

  const shouldLoadGrowthLayer = !isOpsRoute && engagementReady && allowEnhancedGrowthLayer;
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

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await registration.update();
      } catch (error) {
        if (active) {
          console.warn('Failed to register production service worker:', error);
        }
      }
    };

    void registerServiceWorker();

    return () => {
      active = false;
    };
  }, [idleReady]);

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
    setAllowEnhancedGrowthLayer(!reduceEnhancements);
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
        console.warn('Failed to clear dev service workers or caches:', error);
      }
    };

    void clearDevServiceWorkers();
  }, []);

  return (
    <div className="mobile-app-shell min-h-screen flex flex-col bg-background text-foreground relative overflow-x-clip">
      {shouldLoadMotionLayer ? <SiteMotionEnhancer /> : null}
      <Header />
      <main className="site-main relative z-10 flex-grow bg-[radial-gradient(circle_at_top,rgba(40,167,69,0.08),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,248,248,0.98)_22%,rgba(234,247,238,0.68)_100%)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <PageTransition type="fade" duration={0.55}>
          {children}
        </PageTransition>
      </main>
      <MobileBottomNav />
      <ScrollToTopButton />
      <div className="defer-visibility-auto">
        <Footer />
      </div>
      <NotificationContainer notifications={notifications} onClose={removeNotification} />
      {idleReady ? (
        <>
          <PWAInstallPrompt />
          <OfflineIndicator />
          {shouldLoadAnalytics ? <PerformanceMonitor /> : null}
          {shouldLoadGrowthLayer ? (
            <>
              {chatRequested ? (
                <ChatBotWrapper />
              ) : (
                <button
                  type="button"
                  onClick={() => setChatRequested(true)}
                  className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg transition hover:scale-105 hover:shadow-xl sm:bottom-6 sm:right-6"
                  aria-label="Open chat assistant"
                  title="Open chat assistant"
                >
                  <MessageCircle className="h-7 w-7" />
                </button>
              )}
              <CartRecoveryTracker />
              <ExitIntentOffer />
            </>
          ) : null}
        </>
      ) : null}
      <Toaster position="top-center" />
    </div>
  );
}
