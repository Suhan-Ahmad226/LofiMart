import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, install, dismiss } = usePWAInstall();

  return (
    <AnimatePresence>
      {isInstallable && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 right-4 z-50 max-w-sm"
        >
          <div className="bg-gradient-to-r from-primary to-accent text-white rounded-lg shadow-lg p-4 flex items-start gap-4">
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Install LofiMart</h3>
              <p className="text-sm text-white/85">
                Get fast access to LofiMart. Works offline, updates automatically.
              </p>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={install}
                className="bg-white hover:bg-secondary text-primary font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1 text-sm"
              >
                <Download className="w-4 h-4" />
                Install
              </button>
              <button
                onClick={dismiss}
                className="text-white/70 hover:text-white transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PWAInstallPrompt;
