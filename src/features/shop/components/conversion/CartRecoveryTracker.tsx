'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '../../../../features/shop/state/CartContext';
import { useUser } from '../../../../features/shared/state/UserContext';

export default function CartRecoveryTracker() {
  const { items, isReady } = useCart();
  const { token, isAuthenticated } = useUser();
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    if (!isReady || !isAuthenticated || !token) {
      return;
    }

    if (items.length === 0) {
      hasScheduledRef.current = false;
      fetch('/api/cart/recovery/cancel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => undefined);
      return;
    }

    const scheduleRecovery = () => {
      fetch('/api/cart/recovery/schedule', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        keepalive: true,
      }).catch(() => undefined);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && items.length > 0) {
        scheduleRecovery();
        hasScheduledRef.current = true;
      }
    };

    const handleBeforeUnload = () => {
      if (items.length > 0) {
        scheduleRecovery();
        hasScheduledRef.current = true;
      }
    };

    if (!hasScheduledRef.current) {
      const timer = window.setTimeout(() => {
        if (items.length > 0) {
          scheduleRecovery();
          hasScheduledRef.current = true;
        }
      }, 45_000);

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('beforeunload', handleBeforeUnload);

      return () => {
        window.clearTimeout(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isReady, isAuthenticated, token, items]);

  return null;
}
