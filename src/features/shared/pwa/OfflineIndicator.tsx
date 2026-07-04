import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';
import { useOffline } from '@/src/hooks/useOffline';

export const OfflineIndicator: React.FC = () => {
  const { recentlyOffline, recentlyOnline } = useOffline();

  return (
    <AnimatePresence>
      {recentlyOffline && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.96 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-2xl shadow-slate-300/60 sm:bottom-6 sm:left-auto sm:right-6"
          role="status"
          aria-live="polite"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <WifiOff className="h-4 w-4" />
          </span>
          <span className="font-medium">You're offline. Changes will sync when online.</span>
        </motion.div>
      )}

      {recentlyOnline && (
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.96 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-2xl shadow-slate-300/60 sm:bottom-6 sm:left-auto sm:right-6"
          role="status"
          aria-live="polite"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Wifi className="h-4 w-4" />
          </span>
          <span className="font-medium">Back online. Pending changes will sync now.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
