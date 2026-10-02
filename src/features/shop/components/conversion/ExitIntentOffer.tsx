'use client';

import React from 'react';
import { Link, useLocation } from '../../../../lib/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Gift, X } from 'lucide-react';
import { useCommerceConfig } from '../../../shared/state/CommerceConfigContext';

const STORAGE_KEY = 'amarshop-exit-offer-dismissed';

export default function ExitIntentOffer() {
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const commerceConfig = useCommerceConfig();

  const config = React.useMemo(() => {
    const exitIntent = commerceConfig?.exit_intent;
    return {
      enabled: exitIntent ? Boolean(exitIntent.enabled) : true,
      title: String(exitIntent?.title || 'Keep your shortlist moving with a softer first order'),
      message: String(exitIntent?.message || 'Use code WELCOME10 for an extra conversion push on your next checkout.'),
      code: String(exitIntent?.code || 'WELCOME10'),
      primary_cta: String(exitIntent?.primary_cta || 'Review cart'),
      secondary_cta: String(exitIntent?.secondary_cta || 'Keep browsing'),
    };
  }, [commerceConfig]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const dismissed = window.sessionStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      return;
    }
    if (!config.enabled) {
      return;
    }

    const blockedRoutes = ['/checkout', '/order-success'];
    if (blockedRoutes.some((route) => location.pathname.startsWith(route))) {
      return;
    }

    const onMouseOut = (event: MouseEvent) => {
      if (event.clientY <= 12 && !open) {
        setOpen(true);
      }
    };

    document.addEventListener('mouseout', onMouseOut);
    return () => document.removeEventListener('mouseout', onMouseOut);
  }, [location.pathname, open, config.enabled]);

  const close = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    }
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            className="relative w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-2xl"
          >
            <button
              onClick={close}
              className="absolute right-5 top-5 rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-800"
              aria-label="Close offer"
            >
              <X size={18} />
            </button>

            <div className="mb-5 inline-flex rounded-2xl bg-primary/10 p-3 text-primary">
              <Gift size={24} />
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-primary/70">Before you go</p>
            <h2 className="mt-3 text-3xl font-bold text-gray-950">{config.title}</h2>
            <p className="mt-4 text-sm leading-6 text-gray-600">
              {config.message}{' '}
              <span className="font-bold text-gray-900">{config.code}</span>
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                to="/cart"
                onClick={close}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {config.primary_cta}
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/shop"
                onClick={close}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:border-primary hover:text-primary"
              >
                {config.secondary_cta}
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
