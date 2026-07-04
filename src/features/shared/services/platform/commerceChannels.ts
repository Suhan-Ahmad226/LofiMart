import {
  AVAILABLE_CHECKOUT_PAYMENT_METHODS,
  AVAILABLE_COURIER_PROVIDERS,
  AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS,
  DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS,
  DEFAULT_ENABLED_COURIER_PROVIDERS,
  DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS,
  type CheckoutPaymentMethod,
  type CourierProviderCode,
  type ManualOrderPaymentMethod,
} from '@/src/lib/commerce-channels';
import { getOrSetCache } from '@/src/services/cache/store';
import { prismaDirect } from '@/src/services/database/prisma';

const PLATFORM_SETTING_KEYS = {
  checkout: 'enabled_checkout_payment_methods',
  manual: 'enabled_manual_order_payment_methods',
  courier: 'enabled_courier_providers',
} as const;

function parseEnabledList<T extends readonly string[]>(
  rawValue: string | null | undefined,
  allowed: T,
  fallback: readonly string[],
): T[number][] {
  const values = String(rawValue || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .filter((value): value is T[number] => allowed.includes(value as T[number]));

  return values.length > 0 ? values : [...fallback] as T[number][];
}

export type CommerceChannelSettings = {
  checkoutPaymentMethods: CheckoutPaymentMethod[];
  manualOrderPaymentMethods: ManualOrderPaymentMethod[];
  courierProviders: CourierProviderCode[];
};

export async function getCommerceChannelSettings(): Promise<CommerceChannelSettings> {
  return getOrSetCache(
    'platform:commerce-channel-settings',
    async () => {
      const rows = await prismaDirect.platformSetting.findMany({
        where: {
          key: {
            in: [
              PLATFORM_SETTING_KEYS.checkout,
              PLATFORM_SETTING_KEYS.manual,
              PLATFORM_SETTING_KEYS.courier,
            ],
          },
        },
      });

      const settingMap = rows.reduce<Record<string, string>>((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});

      return {
        checkoutPaymentMethods: parseEnabledList(
          settingMap[PLATFORM_SETTING_KEYS.checkout],
          AVAILABLE_CHECKOUT_PAYMENT_METHODS,
          DEFAULT_ENABLED_CHECKOUT_PAYMENT_METHODS,
        ),
        manualOrderPaymentMethods: parseEnabledList(
          settingMap[PLATFORM_SETTING_KEYS.manual],
          AVAILABLE_MANUAL_ORDER_PAYMENT_METHODS,
          DEFAULT_ENABLED_MANUAL_ORDER_PAYMENT_METHODS,
        ),
        courierProviders: parseEnabledList(
          settingMap[PLATFORM_SETTING_KEYS.courier],
          AVAILABLE_COURIER_PROVIDERS,
          DEFAULT_ENABLED_COURIER_PROVIDERS,
        ),
      };
    },
    300,
  );
}

export async function isCheckoutPaymentMethodEnabled(value: string | null | undefined) {
  const settings = await getCommerceChannelSettings();
  return settings.checkoutPaymentMethods.includes(String(value || '').toLowerCase() as CheckoutPaymentMethod);
}

export async function isManualOrderPaymentMethodEnabled(value: string | null | undefined) {
  const settings = await getCommerceChannelSettings();
  return settings.manualOrderPaymentMethods.includes(String(value || '').toLowerCase() as ManualOrderPaymentMethod);
}

export async function isCourierProviderEnabled(value: string | null | undefined) {
  const settings = await getCommerceChannelSettings();
  return settings.courierProviders.includes(String(value || '').toLowerCase() as CourierProviderCode);
}

export function serializeCommerceChannelSettings(settings: CommerceChannelSettings) {
  return {
    enabled_checkout_payment_methods: settings.checkoutPaymentMethods,
    enabled_manual_order_payment_methods: settings.manualOrderPaymentMethods,
    enabled_courier_providers: settings.courierProviders,
  };
}
