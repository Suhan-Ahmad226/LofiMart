import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';
import { useOffline } from '../hooks/useOffline';

export const OfflineIndicator: React.FC = () => {
  const { isOnline, recentlyOnline } = useOffline();

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed top-0 left-0 right-0 bg-yellow-500 text-white px-4 py-3 z-50 flex items-center justify-center gap-2"
        >
          <WifiOff className="w-5 h-5" />
          <span className="font-medium">You're offline - Changes will sync when online</span>
        </motion.div>
      )}

      {isOnline && recentlyOnline && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="fixed top-0 left-0 right-0 bg-green-500 text-white px-4 py-2 z-50 flex items-center justify-center gap-2 text-sm"
        >
          <Wifi className="w-4 h-4" />
          <span>Back online</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
