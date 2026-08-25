import { getCachedClientValue } from './client-cache';

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

export function fetchCommerceConfig(): Promise<CommerceConfig | null> {
  return getCachedClientValue('commerce-config:public:v1', 10 * 60 * 1000, async () => {
    const response = await fetch('/api/public/commerce-config', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('Failed to load commerce config');
    }
    return response.json().catch(() => null);
  });
}
