'use client';

import { useEffect, useRef } from 'react';
import { useCart } from '../../../../features/shop/state/CartContext';
import { useUser } from '../../../../features/shared/state/UserContext';

const SCHEDULE_WAIT_MS = 45_000;

export default function CartRecoveryTracker() {
  const { items, isReady } = useCart();
  const { token, isAuthenticated } = useUser();
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    if (!isReady || !isAuthenticated || !token) {
      hasScheduledRef.current = false;
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    const scheduleRecovery = () => {
      if (hasScheduledRef.current) {
        return;
      }
      hasScheduledRef.current = true;
      void fetch('/api/cart/recovery/schedule', {
        method: 'POST',
        headers,
        keepalive: true,
      })
        .then((response) => {
          if (!response.ok) {
            hasScheduledRef.current = false;
          }
        })
        .catch(() => {
          hasScheduledRef.current = false;
        });
    };

    if (items.length === 0) {
      if (hasScheduledRef.current) {
        void fetch('/api/cart/recovery/cancel', {
          method: 'POST',
          headers,
        }).catch(() => undefined);
        hasScheduledRef.current = false;
      }
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        scheduleRecovery();
      }
    };

    const timer = hasScheduledRef.current
      ? null
      : window.setTimeout(scheduleRecovery, SCHEDULE_WAIT_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', scheduleRecovery);

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', scheduleRecovery);
    };
  }, [isReady, isAuthenticated, token, items]);

  return null;
}
