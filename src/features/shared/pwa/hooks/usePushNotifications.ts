import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/client';

export interface NotificationOptions {
  title: string;
  options?: NotificationOptions & {
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    requireInteraction?: boolean;
    actions?: Array<{
      action: string;
      title: string;
      icon?: string;
    }>;
    data?: any;
  };
}

interface UsePushNotificationsReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  isConfigReady: boolean;
  isPushConfigured: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
  sendNotification: (title: string, options?: any) => Promise<void>;
  requestPermission: () => Promise<NotificationPermission>;
}

export const usePushNotifications = (): UsePushNotificationsReturn => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigReady, setIsConfigReady] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [webPushPublicKey, setWebPushPublicKey] = useState<string>(
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY || ''
  );

  const clearExpiredAuth = useCallback(() => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } catch {
      // Ignore storage cleanup failures.
    }
  }, []);

  const ensureServiceWorker = useCallback(async () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      throw new Error('Service workers are not available in this environment');
    }

    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      setRegistration(existing);
      return existing;
    }

    const nextRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    setRegistration(nextRegistration);
    return nextRegistration;
  }, []);

  // Check subscription status on mount
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setIsSupported(false);
      return;
    }

    setIsSupported(
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    );
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const checkSubscription = async () => {
      try {
        const currentRegistration = await ensureServiceWorker();
        await navigator.serviceWorker.ready;
        const subscription = await (currentRegistration as any).pushManager?.getSubscription?.();
        setIsSubscribed(!!subscription);
      } catch (err) {
        console.error('Error checking subscription:', err);
      }
    };

    const loadPublicConfig = async () => {
      if (webPushPublicKey) {
        setIsConfigReady(true);
        return;
      }

      try {
        const response = await fetch('/api/config/public', { cache: 'no-store' });
        const payload = await response.json();
        const key = payload?.data?.webPushPublicKey;
        if (typeof key === 'string' && key.length > 0) {
          setWebPushPublicKey(key);
        }
      } catch (err) {
        console.error('Failed to load public config:', err);
      } finally {
        setIsConfigReady(true);
      }
    };

    void loadPublicConfig();
    void checkSubscription();
  }, [ensureServiceWorker, isSupported, webPushPublicKey]);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    try {
      if (typeof window === 'undefined' || typeof Notification === 'undefined') {
        throw new Error('Notifications are not available in this environment');
      }

      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      setError('Failed to request notification permission');
      throw err;
    }
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Push notifications not supported');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request permission first
      const permission = await requestPermission();
      if (permission !== 'granted') {
        setError('Notification permission denied');
        return false;
      }

      if (!webPushPublicKey) {
        setError('Notifications are not available right now.');
        return false;
      }

      // Get service worker registration
      const currentRegistration = registration ?? await ensureServiceWorker();
      await navigator.serviceWorker.ready;
      
      // Subscribe to push manager using the configured VAPID key
      const subscription = await (currentRegistration as any).pushManager?.subscribe?.({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(webPushPublicKey),
      });

      if (subscription) {
        const { data: sessionData } = await createClient().auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setError('Please log in to enable notifications.');
          await subscription.unsubscribe().catch(() => undefined);
          setIsSubscribed(false);
          return false;
        }

        let response: Response;
        try {
          response = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(subscription),
          });
        } catch (networkError) {
          await subscription.unsubscribe().catch(() => undefined);
          setIsSubscribed(false);
          setError('Could not connect to the notification service right now. Please try again in a moment.');
          return false;
        }

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.error || 'Failed to save push subscription';

          if (response.status === 401 || response.status === 403 || /token expired/i.test(message)) {
            setError('Your session expired. Please log in again to enable notifications.');
            setIsSubscribed(false);
            return false;
          }

          throw new Error(message);
        }

        setIsSubscribed(true);
        return true;
      }

      return false;
    } catch (err) {
      if (!(err instanceof Error && /token expired/i.test(err.message))) {
        console.error('Subscription error:', err);
      }
      setError(err instanceof Error ? err.message : 'Subscription failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [ensureServiceWorker, isSupported, registration, requestPermission, webPushPublicKey]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;

    setIsLoading(true);
    setError(null);

    try {
      const currentRegistration = registration ?? await ensureServiceWorker();
      await navigator.serviceWorker.ready;
      const subscription = await (currentRegistration as any).pushManager?.getSubscription?.();
      
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        const { data: sessionData } = await createClient().auth.getSession();
        const token = sessionData.session?.access_token;
        if (token && endpoint) {
          await fetch('/api/notifications/unsubscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ endpoint }),
          }).catch(() => undefined);
        }

        setIsSubscribed(false);
      }
    } catch (err) {
      console.error('Unsubscription error:', err);
      setError(err instanceof Error ? err.message : 'Unsubscription failed');
    } finally {
      setIsLoading(false);
    }
  }, [ensureServiceWorker, isSupported, registration]);

  const sendNotification = useCallback(
    async (title: string, options?: any) => {
      if (!isSupported) return;

      try {
        const currentRegistration = registration ?? await ensureServiceWorker();
        await navigator.serviceWorker.ready;
        await (currentRegistration as any).showNotification(title, {
          icon: '/icon.svg',
          badge: '/icon.svg',
          ...options,
        });
      } catch (err) {
        console.error('Send notification error:', err);
        setError(err instanceof Error ? err.message : 'Failed to send notification');
      }
    },
    [ensureServiceWorker, isSupported, registration]
  );

  return {
    isSupported,
    isSubscribed,
    isLoading,
    isConfigReady,
    isPushConfigured: webPushPublicKey.length > 0,
    error,
    subscribe,
    unsubscribe,
    sendNotification,
    requestPermission,
  };
};

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
