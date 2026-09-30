export const AVAILABLE_CHECKOUT_PAYMENT_METHODS = ['cod'] as const;
export const AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS = ['cod', 'cash', 'bkash', 'nagad', 'bank_transfer'] as const;
export const AVAILABLE_COURIER_PROVIDERS = ['pathao'] as const;

export const DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS = ['cod'] as const;
export const DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS = ['cod'] as const;
export const DEFAULT_ENABLED_COURIER_PROVIDERS = ['pathao'] as const;

export const PLATFORM_FEE = 5;

export type CheckoutPaymentMethod = (typeof AVAILABLE_CHECKOUT_PAYMENT_METHODS)[number];
export type ManualOrderPaymentMethod = (typeof AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS)[number];
export type CourierProviderCode = (typeof AVAILABLE_COURIER_PROVIDERS)[number];

export function isKnownCheckoutPaymentMethod(value: string | null | undefined): value is CheckoutPaymentMethod {
  return AVAILABLE_CHECKOUT_PAYMENT_METHODS.includes(String(value || '').toLowerCase() as CheckoutPaymentMethod);
}

export function isKnownManualOrderPaymentMethod(value: string | null | undefined): value is ManualOrderPaymentMethod {
  return AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS.includes(String(value || '').toLowerCase() as ManualOrderPaymentMethod);
}

export function isKnownCourierProvider(value: string | null | undefined): value is CourierProviderCode {
  return AVAILABLE_COURIER_PROVIDERS.includes(String(value || '').toLowerCase() as CourierProviderCode);
}