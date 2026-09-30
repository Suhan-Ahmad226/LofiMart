/**
 * Pathao wire types.
 *
 * These describe the raw Merchant API payloads. Nothing outside
 * `providers/pathao` may import them: the boundary is the mapper, which turns
 * these into the provider-neutral types in `core/contracts`.
 */

import type { PathaoDeliveryType, PathaoItemType } from './pathaoConstants';

export type PathaoTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
};

export type PathaoTokenBundle = {
  tokenType: string;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  issuedAt: number;
};

export type PathaoTokenGrantMode = 'password' | 'refresh_token';

export type PathaoCity = {
  city_id: number;
  city_name: string;
};

export type PathaoZone = {
  zone_id: number;
  zone_name: string;
};

export type PathaoArea = {
  area_id: number;
  area_name: string;
  home_delivery_available?: boolean | number;
  pickup_available?: boolean | number;
};

export type PathaoStoreRow = {
  store_id: number;
  store_name?: string | null;
  store_address?: string | null;
  is_active?: number | boolean;
  city_id?: number | string | null;
  zone_id?: number | string | null;
  hub_id?: number | string | null;
  is_default_store?: boolean | number;
  is_default_return_store?: boolean | number;
};

/**
 * Pathao store creation is asynchronous: the API accepts the store and the
 * courier reviews it, typically taking up to an hour. A 200 response therefore
 * does not mean "bookable".
 */
export type PathaoStoreCreateResponse = {
  message?: string | null;
  result?: boolean | number;
  data?: { store_name?: string | null } | null;
  store_name?: string | null;
};

export type PathaoStorePayload = {
  name: string;
  contact_name: string;
  contact_number: string;
  secondary_contact?: string;
  otp_number?: string;
  address: string;
  city_id: number;
  zone_id: number;
  area_id: number;
};

export type PathaoSingleOrderPayload = {
  store_id: number;
  merchant_order_id?: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_secondary_phone?: string;
  recipient_address: string;
  recipient_city?: number;
  recipient_zone?: number;
  recipient_area?: number;
  delivery_type: PathaoDeliveryType;
  item_type: PathaoItemType;
  special_instruction?: string;
  item_quantity: number;
  item_weight: number | string;
  item_description?: string;
  amount_to_collect: number;
};

export type PathaoBulkOrderPayload = {
  orders: PathaoSingleOrderPayload[];
};

export type PathaoOrderInfo = {
  consignment_id?: string | number | null;
  merchant_order_id?: string | null;
  order_status?: string | null;
  order_status_slug?: string | null;
  event?: string | null;
  updated_at?: string | null;
  invoice_id?: string | null;
  delivery_fee?: number | string | null;
  is_parcel?: boolean | number;
  store_id?: number | string | null;
  recipient?: Record<string, unknown> | null;
};

export type PathaoOrderCreateResponse = {
  consignment_id?: string | number | null;
  merchant_order_id?: string | null;
  order_status?: string | null;
  order_status_slug?: string | null;
  delivery_fee?: number | string | null;
};

export type PathaoPricePlanPayload = {
  store_id: number;
  item_type: PathaoItemType;
  delivery_type: PathaoDeliveryType;
  item_weight: number;
  recipient_city: number;
  recipient_zone: number;
};

export type PathaoPricePlanResponse = {
  price?: number | string | null;
  discount?: number | string | null;
  promo_discount?: number | string | null;
  plan_id?: number | string | null;
  cod_enabled?: boolean | number | string | null;
  cod_percentage?: number | string | null;
  additional_charge?: number | string | null;
  final_price?: number | string | null;
};
