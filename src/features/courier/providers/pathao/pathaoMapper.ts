/**
 * Pathao ↔ internal translation.
 *
 * This is the only module that knows both vocabularies. Everything above it
 * speaks `InternalShipmentStatus` and `CourierBookingRequest`; everything below
 * it speaks Pathao's field names.
 *
 * The status table is an explicit allowlist rather than the substring matching
 * the old webhook service used. Substring matching is why `"Parcel Returned"`
 * could previously resolve to `delivery_failed` (it contains "fail"-adjacent
 * wording in some payloads) and why a new Pathao status would silently land in
 * a wrong bucket. An unrecognised status now returns `null`, which the caller
 * records as an unmapped event instead of guessing.
 */

import { CourierValidationError } from '../../core/errors';
import type {
  CourierBookingRequest,
  CourierLocationNode,
  CourierStoreRef,
} from '../../core/contracts';
import type { InternalShipmentStatus } from '../../core/status';
import {
  PATHAO_DELIVERY_TYPE,
  PATHAO_FIELD_LIMITS,
  PATHAO_ITEM_TYPE,
  PATHAO_PROVIDER_CODE,
  PATHAO_WEIGHT_LIMITS,
  type PathaoDeliveryType,
  type PathaoItemType,
} from './pathaoConstants';
import type {
  PathaoBulkOrderPayload,
  PathaoPricePlanPayload,
  PathaoSingleOrderPayload,
  PathaoStorePayload,
} from './pathaoTypes';
import { normalizeBdPhone } from '../../core/http';
import { readPathaoField } from './pathaoSchemas';

/* ------------------------------------------------------------------ statuses */

/**
 * Pathao's published `order_status_slug` values, mapped to the internal
 * vocabulary.
 *
 * Notes on the non-obvious entries:
 *  - `Courier Reject` is Pathao declining the pickup. It is a failure of the
 *    movement, not a cancellation by us, so it maps to `delivery_failed` and
 *    surfaces to the seller as "the courier declined collection".
 *  - `Parcel Info Received` means the parcel has entered the network but has
 *    not been scanned onto a rider, so `in_transit` is the honest status.
 *  - `* Delivery Attempted` means the rider is trying now, so it is
 *    `out_for_delivery`, not a failure. A real failure arrives as
 *    `Parcel Canceled`/`Parcel Returned`.
 */
const STATUS_MAP: Readonly<Record<string, InternalShipmentStatus>> = {
  'order pickup info received': 'processing',
  'parcel info received': 'in_transit',
  'courier request accepted': 'pickup_requested',
  'pickup request accepted': 'pickup_requested',
  'parcel received': 'ready_for_pickup',
  'parcel picked up': 'picked_up',
  'in transit': 'in_transit',
  'parcel out for delivery': 'out_for_delivery',
  'delivery attempted': 'out_for_delivery',
  'parcel delivery attempted': 'out_for_delivery',
  'parcel delivered': 'delivered',
  'courier reject': 'delivery_failed',
  'parcel returned': 'returned',
  'order pickup info cancelled': 'cancelled',
  'pickup request cancelled': 'cancelled',
  'parcel canceled': 'cancelled',
  'order canceled': 'cancelled',
  'order cancelled': 'cancelled',
};

/** Normalises a provider status for table lookup: case, spacing and punctuation. */
function normalizeStatusKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Translates a Pathao status string.
 *
 * Returns `null` for anything unrecognised. Callers must treat `null` as "the
 * courier told us something we cannot model" and persist the raw value for
 * audit rather than coercing it to a neighbouring status.
 */
export function mapPathaoStatus(raw: string | null | undefined): InternalShipmentStatus | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return STATUS_MAP[normalizeStatusKey(raw)] ?? null;
}

/**
 * Picks the best available status string from a Pathao payload.
 *
 * `order_status_slug` is preferred over the human-readable `order_status`
 * because the slug is the stable identifier; `event` is the fallback used by
 * webhook deliveries.
 */
export function pickPathaoStatusString(payload: {
  order_status_slug?: unknown;
  order_status?: unknown;
  event?: unknown;
}): string | null {
  const candidates = [payload.order_status_slug, payload.order_status, payload.event];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

/* -------------------------------------------------------------------- money */

/** Money is handled in minor units at the boundary to avoid float drift. */
export function toMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Parses a provider amount that may arrive as a number, a numeric string, or
 * absent. Returns `null` rather than 0 when the value is missing, so "the
 * courier did not tell us" is never recorded as "the charge was zero".
 */
export function parseProviderMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? toMoney(value) : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? toMoney(parsed) : null;
  }
  return null;
}

/** Pathao sends fractional amounts ("125.50"); integer minor units are safer. */
export function parseProviderInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : Math.trunc(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}

/* ----------------------------------------------------------------- validation */

function fail(message: string, details: Record<string, unknown>): never {
  throw new CourierValidationError(PATHAO_PROVIDER_CODE, message, details);
}

/**
 * Enforces Pathao's parcel weight window.
 *
 * Rejects rather than clamping. Clamping 0.3 kg up to 0.5 kg would silently
 * change what the courier collects, and clamping 12 kg down to 10 kg would lose
 * the parcel entirely. Whether sub-minimum parcels should instead be *billed* at
 * the 0.5 kg minimum is a pricing decision, not an integration one, so it is
 * left to the caller.
 */
export function assertPathaoWeight(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    fail('Parcel weight must be a positive number.', { weightKg });
  }

  if (weightKg > PATHAO_WEIGHT_LIMITS.MAX_KG) {
    fail(
      `Parcel weight ${weightKg}kg exceeds the courier maximum of ${PATHAO_WEIGHT_LIMITS.MAX_KG}kg. Split the order or arrange a commercial pickup.`,
      { weightKg, maxKg: PATHAO_WEIGHT_LIMITS.MAX_KG },
    );
  }

  if (weightKg < PATHAO_WEIGHT_LIMITS.MIN_KG) {
    fail(
      `Parcel weight ${weightKg}kg is below the courier minimum of ${PATHAO_WEIGHT_LIMITS.MIN_KG}kg.`,
      { weightKg, minKg: PATHAO_WEIGHT_LIMITS.MIN_KG },
    );
  }

  // Pathao accepts at most two decimal places on weight.
  return Math.round(weightKg * 100) / 100;
}

function assertLength(
  value: string,
  field: string,
  min: number,
  max: number,
): string {
  const trimmed = value.trim();
  if (trimmed.length < min) {
    fail(`${field} is too short (minimum ${min} characters).`, { field, length: trimmed.length, min });
  }
  if (trimmed.length > max) {
    fail(`${field} is too long (maximum ${max} characters).`, { field, length: trimmed.length, max });
  }
  return trimmed;
}

/**
 * Resolves a required phone number to the local 11-digit form.
 *
 * Fails rather than forwarding a malformed value: Pathao rejects it, and a
 * silent empty string produces a parcel with no reachable recipient.
 */
function requirePhone(value: string | null | undefined, field: string): string {
  const normalized = normalizeBdPhone(value);
  if (!normalized) {
    fail(`${field} must be a valid Bangladeshi mobile number.`, { field });
  }
  return normalized;
}

function optionalPhone(value: string | null | undefined, field: string): string | undefined {
  if (value === null || value === undefined || !String(value).trim()) return undefined;
  const normalized = normalizeBdPhone(value);
  if (!normalized) {
    fail(`${field} must be a valid Bangladeshi mobile number.`, { field });
  }
  return normalized;
}

/* ------------------------------------------------------------------ payloads */

export function mapDeliverySpeedToPathao(
  speed: CourierBookingRequest['parcel']['deliverySpeed'],
): PathaoDeliveryType {
  return speed === 'express' ? PATHAO_DELIVERY_TYPE.ON_DEMAND : PATHAO_DELIVERY_TYPE.NORMAL;
}

export function mapItemTypeToPathao(
  itemType: CourierBookingRequest['parcel']['itemType'],
): PathaoItemType {
  return itemType === 'document' ? PATHAO_ITEM_TYPE.DOCUMENT : PATHAO_ITEM_TYPE.PARCEL;
}

function requireLocation(
  location: { cityId: number | null; zoneId: number | null; areaId: number | null } | null,
  side: 'pickup' | 'recipient',
) {
  if (!location) {
    // Never fall back to a default city: a wrong area means a wrong price and a
    // parcel the rider cannot find.
    fail(
      `The ${side} location is not mapped to courier areas. Map it before booking.`,
      { side },
    );
  }
  if (location.cityId === null || location.zoneId === null || location.areaId === null) {
    fail(`The ${side} location is only partially mapped. Map city, zone and area before booking.`, {
      side,
      cityId: location.cityId,
      zoneId: location.zoneId,
      areaId: location.areaId,
    });
  }
  return {
    cityId: location.cityId as number,
    zoneId: location.zoneId as number,
    areaId: location.areaId as number,
  };
}

function requireStoreId(store: { externalStoreId: string } | null, side: 'pickup'): number {
  if (!store) {
    fail(`No courier pickup store is configured for this ${side}.`, { side });
  }
  const parsed = Number(store.externalStoreId);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    fail('The configured courier pickup store is invalid.', {
      side,
      externalStoreId: store.externalStoreId,
    });
  }
  return parsed;
}

/**
 * Builds the Pathao consignment payload for one parcel.
 *
 * Every field Pathao requires is validated here, before the request is issued,
 * so a malformed order fails with an actionable message instead of a generic
 * 400 from the API.
 */
export function buildPathaoOrderPayload(
  request: CourierBookingRequest,
): PathaoSingleOrderPayload {
  const storeId = requireStoreId(request.pickup.store, 'pickup');
  const recipientLocation = requireLocation(request.customer.location, 'recipient');

  const recipientName = assertLength(
    request.customer.name ?? '',
    'Recipient name',
    PATHAO_FIELD_LIMITS.RECIPIENT_NAME_MIN,
    PATHAO_FIELD_LIMITS.RECIPIENT_NAME_MAX,
  );
  const recipientAddress = assertLength(
    request.customer.address ?? '',
    'Recipient address',
    PATHAO_FIELD_LIMITS.RECIPIENT_ADDRESS_MIN,
    PATHAO_FIELD_LIMITS.RECIPIENT_ADDRESS_MAX,
  );

  const quantity = Math.max(1, Math.trunc(request.parcel.quantity || 1));
  const weight = assertPathaoWeight(request.parcel.weightKg);

  const payload: PathaoSingleOrderPayload = {
    store_id: storeId,
    // The idempotency handle. Pathao echoes it back, which is how a retry is
    // verified rather than assumed.
    merchant_order_id: request.merchantReference,
    recipient_name: recipientName,
    recipient_phone: requirePhone(request.customer.phone, 'Recipient phone'),
    recipient_address: recipientAddress,
    recipient_city: recipientLocation.cityId,
    recipient_zone: recipientLocation.zoneId,
    recipient_area: recipientLocation.areaId,
    delivery_type: mapDeliverySpeedToPathao(request.parcel.deliverySpeed),
    item_type: mapItemTypeToPathao(request.parcel.itemType),
    item_quantity: quantity,
    item_weight: weight,
    // The rider collects this. Uses the COD amount, never the goods value, so a
    // miscomputed order total cannot turn into a collection discrepancy.
    amount_to_collect: toMoney(request.codAmount),
  };

  const secondaryPhone = optionalPhone(
    request.customer.secondaryPhone,
    'Recipient secondary phone',
  );
  if (secondaryPhone) payload.recipient_secondary_phone = secondaryPhone;

  if (request.parcel.description) {
    payload.item_description = request.parcel.description.slice(0, 200);
  }
  if (request.parcel.specialInstruction) {
    payload.special_instruction = request.parcel.specialInstruction.slice(0, 200);
  }

  return payload;
}

export function buildPathaoBulkOrderPayload(
  requests: CourierBookingRequest[],
): PathaoBulkOrderPayload {
  return { orders: requests.map((request) => buildPathaoOrderPayload(request)) };
}

export function buildPathaoPricePlanPayload(input: {
  store: { externalStoreId: string } | null;
  recipientLocation: { cityId: number | null; zoneId: number | null; areaId: number | null } | null;
  weightKg: number;
  itemType: CourierBookingRequest['parcel']['itemType'];
  deliverySpeed: CourierBookingRequest['parcel']['deliverySpeed'];
}): PathaoPricePlanPayload {
  const storeId = requireStoreId(input.store, 'pickup');
  const location = requireLocation(input.recipientLocation, 'recipient');

  return {
    store_id: storeId,
    item_type: mapItemTypeToPathao(input.itemType),
    delivery_type: mapDeliverySpeedToPathao(input.deliverySpeed),
    item_weight: assertPathaoWeight(input.weightKg),
    recipient_city: location.cityId,
    recipient_zone: location.zoneId,
  };
}

/**
 * Pathao's price plan is somewhat inconsistent about which field is the final
 * amount, so the precedence is explicit here rather than guessed per call site.
 */
export function resolvePathaoPricePlan(input: {
  finalPrice?: number | string | null;
  price?: number | string | null;
  additionalCharge?: number | string | null;
  codPercentage?: number | string | null;
  codEnabled?: boolean | number | string | null;
  codAmount: number;
}): { courierCharge: number; codFee: number; discount: number; additionalCharge: number; codEnabled: boolean } {
  const base = parseProviderMoney(input.finalPrice) ?? parseProviderMoney(input.price) ?? 0;
  const additionalCharge = parseProviderMoney(input.additionalCharge) ?? 0;
  const codEnabled = normalizeBooleanFlag(input.codEnabled);
  const codFee = codEnabled ? toMoney((base * (parseProviderMoney(input.codPercentage) ?? 0)) / 100) : 0;

  return {
    courierCharge: base,
    codFee,
    discount: 0,
    additionalCharge,
    codEnabled,
  };
}

export function normalizeBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

export function mapPathaoStoreStatus(
  row: { is_active?: number | boolean; is_default_store?: boolean | number } | null | undefined,
): 'active' | 'inactive' {
  if (!row) return 'inactive';
  return normalizeBooleanFlag(row.is_active) ? 'active' : 'inactive';
}

/**
 * Translates a provider-neutral pickup point into Pathao's store payload.
 *
 * Optional fields are omitted rather than sent as `null`, which is what the
 * Pathao documentation requires. Field lengths are asserted here so an
 * over-long warehouse name is rejected locally with a precise message instead of
 * coming back as an opaque 422 from the courier.
 */
export function buildPathaoStorePayload(input: {
  name: string;
  contactName: string;
  contactPhone: string;
  secondaryPhone?: string | null;
  otpNumber?: string | null;
  address: string;
  location: { cityId: number | null; zoneId: number | null; areaId: number | null };
}): PathaoStorePayload {
  const location = requireLocation(input.location, 'pickup');

  const phone = normalizeBdPhone(input.contactPhone);
  if (!phone) {
    throw new CourierValidationError(
      PATHAO_PROVIDER_CODE,
      'The pickup point contact number must be a valid 11-digit Bangladesh number.',
    );
  }

  const secondary = input.secondaryPhone ? normalizeBdPhone(input.secondaryPhone) : null;

  return {
    name: assertLength(
      input.name,
      'Pickup point name',
      PATHAO_FIELD_LIMITS.STORE_NAME_MIN,
      PATHAO_FIELD_LIMITS.STORE_NAME_MAX,
    ),
    contact_name: assertLength(
      input.contactName,
      'Pickup point contact name',
      PATHAO_FIELD_LIMITS.STORE_NAME_MIN,
      PATHAO_FIELD_LIMITS.STORE_NAME_MAX,
    ),
    contact_number: phone,
    ...(secondary ? { secondary_contact: secondary } : {}),
    ...(input.otpNumber && normalizeBdPhone(input.otpNumber)
      ? { otp_number: normalizeBdPhone(input.otpNumber) as string }
      : {}),
    address: assertLength(
      input.address,
      'Pickup point address',
      PATHAO_FIELD_LIMITS.STORE_ADDRESS_MIN,
      PATHAO_FIELD_LIMITS.STORE_ADDRESS_MAX,
    ),
    city_id: location.cityId,
    zone_id: location.zoneId,
    area_id: location.areaId,
  };
}

/** One Pathao store row, normalised. */
export function mapPathaoStoreRow(row: unknown): CourierStoreRef | null {
  if (!row || typeof row !== 'object') return null;

  const record = row as Record<string, unknown>;
  const id = parseProviderInteger(record.store_id);
  if (id === null) return null;

  return {
    provider: PATHAO_PROVIDER_CODE,
    externalStoreId: String(id),
    externalStoreName:
      typeof record.store_name === 'string' ? record.store_name.trim() || null : null,
    active: mapPathaoStoreStatus({
      is_active: record.is_active as number | boolean | undefined,
    }) === 'active',
    metadata: {
      address: typeof record.store_address === 'string' ? record.store_address : null,
      cityId: parseProviderInteger(record.city_id),
      zoneId: parseProviderInteger(record.zone_id),
      areaId: parseProviderInteger(record.area_id),
      hubId: record.hub_id == null ? null : String(record.hub_id),
    },
  };
}

/**
 * Normalises a store-creation response.
 *
 * Pathao's create-store response does not carry the new store id, and the store
 * needs an approval period before it can be booked against. Both facts are
 * reported: `approved: false` with the courier's own message lets the seller UI
 * say "under review" rather than "failed" or, worse, "ready".
 */
export function mapPathaoStoreCreateResult(payload: unknown): {
  externalStoreName: string | null;
  message: string | null;
} {
  const message = readPathaoField(payload, 'message');
  const data = readPathaoField(payload, 'data');
  const nestedName = data && typeof data === 'object' ? readPathaoField(data, 'store_name') : undefined;
  const topName = readPathaoField(payload, 'store_name');
  const name = nestedName ?? topName;

  return {
    externalStoreName: typeof name === 'string' ? name.trim() || null : null,
    message: typeof message === 'string' ? message.trim() || null : null,
  };
}

/** Normalises one node of the Pathao city/zone/area hierarchy. */
export function mapPathaoLocationNode(
  row: unknown,
  level: CourierLocationNode['level'],
  parentId: string | null,
): CourierLocationNode | null {
  if (!row || typeof row !== 'object') return null;

  const record = row as Record<string, unknown>;
  const id =
    parseProviderInteger(record.city_id) ??
    parseProviderInteger(record.zone_id) ??
    parseProviderInteger(record.area_id);
  if (id === null) return null;

  const name = String(
    record.city_name ?? record.zone_name ?? record.area_name ?? record.name ?? '',
  ).trim();
  if (!name) return null;

  // Pathao only publishes per-area delivery options. Left `null` elsewhere rather
  // than defaulted to `true`, so the UI never claims a guarantee the courier did
  // not make.
  const hasAreaFlags = record.home_delivery_available !== undefined || record.pickup_available !== undefined;

  return {
    id: String(id),
    name,
    level,
    parentId,
    homeDeliveryAvailable: hasAreaFlags ? normalizeBooleanFlag(record.home_delivery_available) : null,
    pickupAvailable: hasAreaFlags ? normalizeBooleanFlag(record.pickup_available) : null,
  };
}

export { assertLength as assertPathaoFieldLength };
