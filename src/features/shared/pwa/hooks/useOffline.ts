import { useEffect, useState } from 'react';

interface UseOfflineReturn {
  isOnline: boolean;
  isOffline: boolean;
  recentlyOffline: boolean;
  recentlyOnline: boolean;
}

export const useOffline = (): UseOfflineReturn => {
  const [isOnline, setIsOnline] = useState(true);
  const [recentlyOffline, setRecentlyOffline] = useState(false);
  const [recentlyOnline, setRecentlyOnline] = useState(false);

  useEffect(() => {
    if (recentlyOffline) {
      const t = setTimeout(() => setRecentlyOffline(false), 4000);
      return () => clearTimeout(t);
    }
  }, [recentlyOffline]);

  useEffect(() => {
    // hide the "back online" toast after a short delay
    if (recentlyOnline) {
      const t = setTimeout(() => setRecentlyOnline(false), 3000);
      return () => clearTimeout(t);
    }
  }, [recentlyOnline]);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline((prev) => {
        if (!prev) setRecentlyOnline(true);
        return true;
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      setRecentlyOffline(true);
      setRecentlyOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isOnline,
    isOffline: !isOnline,
    recentlyOffline,
    recentlyOnline,
  };
};


