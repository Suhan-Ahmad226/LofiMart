'use client';

import React from 'react';
import { getCachedClientValue } from '../../../lib/client-cache';

export type CommerceConfig = {
  free_shipping_threshold?: number;
  low_stock_threshold?: number;
  cart_recovery_delay_mins?: number;
  enabled_checkout_payment_methods?: string[];
  enabled_manual_order_payment_methods?: string[];
  enabled_courier_providers?: string[];
  exit_intent?: {
    enabled?: boolean;
    title?: string;
    message?: string;
    code?: string;
    primary_cta?: string;
    secondary_cta?: string;
  };
};

type CommerceConfigContextValue = {
  config: CommerceConfig | null;
};

const CommerceConfigContext = React.createContext<CommerceConfigContextValue | undefined>(undefined);

const COMMERCE_CONFIG_CACHE_KEY = 'commerce-config:public:v1';
const COMMERCE_CONFIG_TTL_MS = 10 * 60 * 1000;

async function loadRawCommerceConfig(): Promise<CommerceConfig | null> {
  const response = await fetch('/api/public/commerce-config', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load commerce config');
  }
  return response.json().catch(() => null);
}

export function CommerceConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = React.useState<CommerceConfig | null>(null);

  React.useEffect(() => {
    let active = true;

    getCachedClientValue<CommerceConfig | null>(
      COMMERCE_CONFIG_CACHE_KEY,
      COMMERCE_CONFIG_TTL_MS,
      loadRawCommerceConfig,
    )
      .then((value) => {
        if (active) setConfig(value || null);
      })
      .catch(() => {
        if (active) setConfig(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = React.useMemo(() => ({ config }), [config]);

  return <CommerceConfigContext.Provider value={value}>{children}</CommerceConfigContext.Provider>;
}

export function useCommerceConfig(): CommerceConfig | null {
  const context = React.useContext(CommerceConfigContext);
  if (!context) {
    throw new Error('useCommerceConfig must be used within a CommerceConfigProvider');
  }
  return context.config;
}
