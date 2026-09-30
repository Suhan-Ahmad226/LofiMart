import { useEffect, useState } from 'react';

const PWA_INSTALL_DISMISSED_AT_KEY = 'pwa_install_dismissed_at';
const PWA_INSTALL_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface PWAInstallPrompt {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

interface UsePWAInstallReturn {
  isInstallable: boolean;
  isInstalled: boolean;
  installPrompt: PWAInstallPrompt | null;
  install: () => Promise<void>;
  dismiss: () => void;
}

export const usePWAInstall = (): UsePWAInstallReturn => {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<PWAInstallPrompt | null>(null);

  useEffect(() => {
    const dismissedAt = Number(window.localStorage.getItem(PWA_INSTALL_DISMISSED_AT_KEY) || '0');
    const isDismissedRecently = dismissedAt > 0 && Date.now() - dismissedAt < PWA_INSTALL_DISMISS_TTL_MS;
    const navigatorWithStandalone = window.navigator as NavigatorWithStandalone;

    if (navigatorWithStandalone.standalone === true) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      if (isDismissedRecently) {
        return;
      }

      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt({
        prompt: installEvent.prompt.bind(installEvent),
        userChoice: installEvent.userChoice,
      });
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      window.localStorage.removeItem(PWA_INSTALL_DISMISSED_AT_KEY);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
        window.localStorage.removeItem(PWA_INSTALL_DISMISSED_AT_KEY);
      }

      setDeferredPrompt(null);
      setIsInstallable(false);
    } catch (error) {
      console.error('PWA installation failed:', error);
    }
  };

  const dismiss = () => {
    window.localStorage.setItem(PWA_INSTALL_DISMISSED_AT_KEY, String(Date.now()));
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  return {
    isInstallable,
    isInstalled,
    installPrompt: deferredPrompt,
    install,
    dismiss,
  };
};
