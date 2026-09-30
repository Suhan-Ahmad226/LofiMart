/**
 * Pathao Merchant API constants.
 *
 * Every Pathao-specific magic number lives here and nowhere else. Core code
 * speaks `CourierDeliverySpeed.NORMAL` / `CourierItemType.PARCEL`; only this
 * directory knows those mean 48/1 or 12/2.
 */

/** Pathao `delivery_type` on a consignment. */
export const PATHAO_DELIVERY_TYPE = {
  /** 48h standard delivery. */
  NORMAL: 48,
  /** 12h on-demand delivery. */
  ON_DEMAND: 12,
} as const;

/** Pathao `item_type` on a consignment. */
export const PATHAO_ITEM_TYPE = {
  DOCUMENT: 1,
  PARCEL: 2,
} as const;

export type PathaoDeliveryType = (typeof PATHAO_DELIVERY_TYPE)[keyof typeof PATHAO_DELIVERY_TYPE];
export type PathaoItemType = (typeof PATHAO_ITEM_TYPE)[keyof typeof PATHAO_ITEM_TYPE];

/**
 * Pathao rejects a parcel outside 0.5-10 kg. Validated before every request so
 * an out-of-range value never reaches the API and never has to be worked around
 * by mutating product weight data.
 */
export const PATHAO_WEIGHT_LIMITS = {
  MIN_KG: 0.5,
  MAX_KG: 10,
} as const;

/** Field length limits enforced by Pathao before it will accept a consignment. */
export const PATHAO_FIELD_LIMITS = {
  RECIPIENT_NAME_MIN: 3,
  RECIPIENT_NAME_MAX: 100,
  RECIPIENT_ADDRESS_MIN: 10,
  RECIPIENT_ADDRESS_MAX: 220,
  STORE_NAME_MIN: 3,
  STORE_NAME_MAX: 50,
  STORE_ADDRESS_MIN: 15,
  STORE_ADDRESS_MAX: 120,
  PHONE_LENGTH: 11,
} as const;

/** Endpoints, relative to the configured base URL. */
export const PATHAO_ENDPOINTS = {
  ISSUE_TOKEN: '/aladdin/api/v1/issue-token',
  STORES: '/aladdin/api/v1/stores',
  ORDERS: '/aladdin/api/v1/orders',
  ORDERS_BULK: '/aladdin/api/v1/orders/bulk',
  PRICE_PLAN: '/aladdin/api/v1/merchant/price-plan',
  CITY_LIST: '/aladdin/api/v1/city-list',
} as const;

export function pathaoOrderInfoEndpoint(consignmentId: string) {
  return `/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/info`;
}

export function pathaoZoneListEndpoint(cityId: number) {
  return `/aladdin/api/v1/cities/${encodeURIComponent(String(cityId))}/zone-list`;
}

export function pathaoAreaListEndpoint(zoneId: number) {
  return `/aladdin/api/v1/zones/${encodeURIComponent(String(zoneId))}/area-list`;
}

/**
 * Documented base URLs. `PATHAO_BASE_URL` selects between them; nothing else in
 * the codebase should hardcode a Pathao host.
 */
export const PATHAO_ENVIRONMENTS = {
  production: 'https://api-hermes.pathao.com',
  sandbox: 'https://courier-api-sandbox.pathao.com',
} as const;

/**
 * The only hosts this integration will send merchant credentials to.
 *
 * A base URL is operator-supplied config, which means a typo, a copy-paste from an
 * old dashboard, or a tampered deploy manifest can point it anywhere. Every
 * outbound call carries a bearer token, so an unlisted host is not a 404 — it is the
 * merchant's credentials leaving for a third party.
 *
 * Compared as a parsed host rather than by string prefix, so `https://api-hermes.
 * pathao.com.attacker.test` cannot pass by containing the real host as a prefix.
 * Set `PATHAO_ALLOW_CUSTOM_BASE_URL=1` only for a Pathao host under your own
 * control that is not in the list above.
 */
export const PATHAO_ALLOWED_BASE_HOSTS: readonly string[] = [
  ...Object.values(PATHAO_ENVIRONMENTS).map((url) => new URL(url).host.toLowerCase()),
];

export const PATHAO_PROVIDER_CODE = 'pathao';
export const PATHAO_PROVIDER_NAME = 'Pathao Courier';
