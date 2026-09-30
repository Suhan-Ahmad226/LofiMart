/**
 * The provider contract.
 *
 * This file is the only thing the core application knows about couriers. Order
 * creation, checkout, the seller dashboard, the reseller dashboard, customer
 * tracking and admin logistics all depend on `CourierProvider` and nothing
 * below it, which is what makes adding a courier an additive change.
 *
 * A new provider needs exactly: an adapter implementing this interface, an API
 * client, a mapper, a webhook handler, configuration, and one line in the
 * registry. It must not require editing anything in this file.
 */

import type { CourierCapabilities } from './capabilities';
import type { InternalShipmentStatus } from './status';

/* ------------------------------------------------------------------ provider lifecycle */

/** Registry lifecycle. Distinct from runtime health: a provider can be enabled but degraded. */
export type CourierProviderLifecycle =
  | 'registered'
  | 'configured'
  | 'enabled'
  | 'degraded'
  | 'disabled';

export type CourierProviderHealth = 'healthy' | 'degraded' | 'error' | 'unknown';

export type CourierProviderSetupStatus = 'api_ready' | 'missing_config';

export type CourierProviderView = {
  code: string;
  name: string;
  mode: 'api';
  lifecycle: CourierProviderLifecycle;
  health: CourierProviderHealth;
  capabilities: CourierCapabilities;
  supportsCod: boolean;
  supportsTrackingSync: boolean;
  supportsPickupBooking: boolean;
  setupStatus: CourierProviderSetupStatus;
  setupMessage: string;
  /** Missing configuration keys, if any. Names only, never values. */
  missingConfig: string[];
  brandColor?: string;
  shortLabel?: string;
};

/* ------------------------------------------------------------------ provider-neutral vocabulary */

/**
 * Provider-neutral delivery speed. Each provider maps these onto its own
 * enum; magic numbers such as Pathao's 48/12 never appear in core code.
 */
export type CourierDeliverySpeed = 'standard' | 'express';

export type CourierItemType = 'parcel' | 'document';

export type CourierBookingMode = 'api' | 'manual';

/**
 * A resolved LofiMart location, already mapped to the provider's own ids by
 * the provider's location module. `null` means "not mapped", and a provider
 * must fail loudly rather than substitute a default.
 */
export type CourierLocationRef = {
  provider: string;
  cityId: number | null;
  zoneId: number | null;
  areaId: number | null;
  /** Display name of the mapped location, for logs and admin diagnostics. */
  label?: string | null;
};

/** A pickup location registered with the provider (a Pathao "store"). */
export type CourierStoreRef = {
  provider: string;
  externalStoreId: string;
  externalStoreName?: string | null;
  /** False while the provider still has the store under review. */
  active?: boolean;
  metadata?: Record<string, unknown> | null;
};

/* ------------------------------------------------------------------ quote */

export type CourierQuoteRequest = {
  provider: string;
  /** The pickup point the parcel leaves from. */
  pickupStore: CourierStoreRef | null;
  pickupWarehouseId?: string | null;
  recipientLocation: CourierLocationRef | null;
  weightKg: number;
  itemType: CourierItemType;
  deliverySpeed: CourierDeliverySpeed;
  /** Collectible amount. Drives the COD fee. */
  codAmount?: number;
};

export type CourierQuote = {
  provider: string;
  /** What the customer pays for delivery. */
  customerDeliveryFee: number;
  /** What the courier actually costs the platform. */
  courierCharge: number;
  codFee: number;
  discount: number;
  additionalCharge: number;
  /** provider = courierCharge + codFee - discount + additionalCharge. */
  totalPrice: number;
  currency: string;
  estimatedDeliveryDays: number;
  codEnabled: boolean;
  /** Provider price-plan id, kept for reconciliation against courier invoices. */
  planReference: string | null;
  metadata?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ booking */

export type CourierBookingRequest = {
  orderId: string;
  shipmentId: string;
  provider: string;
  /**
   * Stable provider-side idempotency key. Must be identical across every retry
   * of the same physical parcel, and must never be regenerated per attempt.
   */
  merchantReference: string;
  customer: {
    name: string;
    phone: string | null;
    secondaryPhone?: string | null;
    address: string | null;
    city?: string | null;
    location: CourierLocationRef | null;
  };
  pickup: {
    warehouseId: string | null;
    store: CourierStoreRef | null;
    name: string | null;
    contactName: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    location: CourierLocationRef | null;
  };
  parcel: {
    quantity: number;
    weightKg: number;
    itemType: CourierItemType;
    deliverySpeed: CourierDeliverySpeed;
    description: string | null;
    specialInstruction: string | null;
  };
  /** Amount the rider collects from the customer. */
  codAmount: number;
  /** The shipment's own goods value, kept separate from the collectible amount. */
  shipmentValue: number;
};

export type CourierBookingResult = {
  provider: string;
  /** Provider consignment id. Stored as `OrderShipment.trackingId`. */
  externalShipmentId: string;
  /** Echo of the reference we sent, used to verify the courier stored ours. */
  merchantReference: string | null;
  status: InternalShipmentStatus;
  /** Courier's own status string, for audit only. Never becomes app state. */
  providerStatus: string | null;
  courierCharge: number | null;
  codFee: number | null;
  codAmount: number | null;
  trackingNumber: string | null;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
};

/* ------------------------------------------------------------------ tracking */

export type CourierTrackingRequest = {
  provider: string;
  shipmentId: string;
  externalShipmentId: string;
};

export type CourierTrackingEvent = {
  /** Provider's raw status, for audit. */
  providerStatus: string | null;
  /** Translated into the internal vocabulary. `null` when unmappable. */
  status: InternalShipmentStatus | null;
  description: string | null;
  location: string | null;
  occurredAt: string | null;
};

export type CourierTrackingResult = {
  provider: string;
  externalShipmentId: string;
  /** Internal status. `null` when the provider's answer is not yet mappable. */
  status: InternalShipmentStatus | null;
  providerStatus: string | null;
  courierCharge: number | null;
  events: CourierTrackingEvent[];
  metadata?: Record<string, unknown> | null;
};

/* ------------------------------------------------------------------ locations */

/**
 * One node of a provider's location hierarchy, normalised.
 *
 * Providers do not all use three levels, so `level` and a nullable `parentId`
 * describe a node rather than the shape of a fixed city/zone/area triple. The
 * admin location pickers render whatever hierarchy the provider reports.
 */
export type CourierLocationNode = {
  /** Provider-native id, kept as a string because not every courier uses integers. */
  id: string;
  name: string;
  level: 'city' | 'zone' | 'area' | 'district' | 'postcode' | 'other';
  parentId: string | null;
  /** Per-node delivery options, when the courier publishes them. */
  homeDeliveryAvailable: boolean | null;
  pickupAvailable: boolean | null;
};

/* ------------------------------------------------------------------ stores */

/**
 * A pickup point to register with the provider.
 *
 * Provider-neutral by design: `location` carries the already-mapped ids, so the
 * adapter never has to re-resolve a free-text address and can never book a
 * store into the wrong hub.
 */
export type CourierStoreCreateInput = {
  name: string;
  contactName: string;
  contactPhone: string;
  secondaryPhone?: string | null;
  otpNumber?: string | null;
  address: string;
  location: CourierLocationRef;
};

/**
 * The result of registering a store.
 *
 * `approved` is separate from success on purpose. Pathao accepts a new store and
 * then holds it for review, so "created" and "usable" are genuinely different
 * facts, and the booking path must not treat the first as the second.
 */
export type CourierStoreCreateResult = {
  provider: string;
  externalStoreId: string | null;
  externalStoreName: string | null;
  /** False while the courier is still reviewing the pickup point. */
  approved: boolean;
  message: string | null;
};

/* ------------------------------------------------------------------ health */

/**
 * A provider's operational health, for the admin logistics screen.
 *
 * Deliberately carries no credential, token or secret — only the shape of the
 * configuration, when the token was last issued, and whether the API answers.
 */
export type CourierHealthReport = {
  provider: string;
  healthy: boolean;
  /** Names only, never values. Empty when configuration is complete. */
  missingConfig: string[];
  /** Whether a cached access token exists and roughly how long it is good for. */
  tokenState: {
    hasCachedToken: boolean;
    expiresAt: string | null;
    refreshAvailable: boolean;
  };
  webhookConfigured: boolean;
  /** Round-trip time of the live connectivity probe, in ms. */
  latencyMs: number | null;
  /** Safe, operator-facing message. No raw provider payload. */
  message: string;
  checkedAt: string;
};

/* ------------------------------------------------------------------ cancel */

export type CourierCancelResult = {
  provider: string;
  success: boolean;
  message: string | null;
};

/* ------------------------------------------------------------------ webhooks */

/**
 * A provider webhook after verification and parsing, in the internal
 * vocabulary. `eventId` is the provider's own idempotency handle when it
 * supplies one, so a redelivery can be recognised.
 */
export type CourierWebhookEvent = {
  provider: string;
  /** Provider's unique event id, when available. Used for replay protection. */
  eventId: string | null;
  externalShipmentId: string | null;
  merchantReference: string | null;
  status: InternalShipmentStatus | null;
  providerStatus: string | null;
  occurredAt: string | null;
  /**
   * Non-identifying fields retained for support. Must exclude credentials and
   * customer PII; the provider adapter is responsible for that allowlist.
   */
  metadata: Record<string, unknown>;
};

/* ------------------------------------------------------------------ the contract */

export interface CourierProvider {
  readonly code: string;
  readonly name: string;
  getCapabilities(): CourierCapabilities;

  /**
   * Resolves the provider's readiness without contacting it: is it
   * configured, is it enabled, is it healthy.
   */
  getStatus(): Pick<CourierProviderView, 'lifecycle' | 'health' | 'setupStatus' | 'setupMessage' | 'missingConfig'>;

  /**
   * Maps a LofiMart address to the provider's location hierarchy.
   *
   * Must return `null` rather than a guess when a location cannot be mapped.
   * A wrong city produces a wrong quote and a misrouted parcel, so ambiguity is
   * always an error. `zone` and `area` are optional: a provider that needs a
   * full three-level match returns `null` until they are supplied.
   */
  resolveLocation(input: {
    city?: string | null;
    zone?: string | null;
    area?: string | null;
  }): Promise<CourierLocationRef | null>;

  /** Validates that a location can actually accept the requested delivery mode. */
  isLocationServiceable?(input: { location: CourierLocationRef; deliverySpeed: CourierDeliverySpeed }): Promise<boolean>;

  /**
   * Lists one level of the provider's location hierarchy.
   *
   * Exists so the admin/seller location pickers can be provider-driven instead of
   * hardcoding a courier's city/zone/area route. Implemented only when
   * `getCapabilities().locationLookup` is true.
   *
   * `parentId` is the id of the node one level up, or `null` for the top level.
   */
  listLocations?(input: {
    level: CourierLocationNode['level'];
    parentId?: string | null;
  }): Promise<CourierLocationNode[]>;

  /* -------------------------------------------------------------- stores */

  /**
   * Lists the pickup points registered with the provider.
   *
   * Implemented only when `getCapabilities().storeManagement` is true.
   */
  listStores?(): Promise<CourierStoreRef[]>;

  /**
   * Registers a pickup point with the provider.
   *
   * Must be idempotent from the caller's perspective: the service layer checks
   * `CourierStoreMapping` first, so a retry after a timeout must reconcile the
   * existing store rather than create a second one. `approved: false` is a
   * success, not a failure — the courier is reviewing the pickup point.
   */
  createStore?(input: CourierStoreCreateInput): Promise<CourierStoreCreateResult>;

  /**
   * Reads one pickup point back, so a mapping can be verified rather than
   * assumed. Returns `null` when the courier has no such store.
   */
  getStore?(externalStoreId: string): Promise<CourierStoreRef | null>;

  /**
   * Probes live connectivity and reports operational health.
   *
   * Must never include a secret in `message`, and must not throw: an unreachable
   * courier is a health report, not an exception.
   */
  checkHealth?(): Promise<CourierHealthReport>;

  getQuote(request: CourierQuoteRequest): Promise<CourierQuote>;

  createShipment(request: CourierBookingRequest): Promise<CourierBookingResult>;

  getShipmentStatus(request: CourierTrackingRequest): Promise<CourierTrackingResult>;

  /**
   * Finds a consignment by the reference we sent, for a booking whose response
   * was lost. Implemented only when `getCapabilities().referenceLookup` is true.
   *
   * Returning `null` means "the courier has no such consignment", which is a
   * definitive answer and makes the booking safely retryable. Throwing means
   * "could not tell", which must not be treated as the same thing.
   */
  findShipmentByReference?(request: {
    provider: string;
    merchantReference: string;
  }): Promise<CourierTrackingResult | null>;

  cancelShipment?(request: CourierTrackingRequest): Promise<CourierCancelResult>;

  /**
   * Verifies authenticity. Must fail closed when the provider's shared secret
   * is unset: an unconfigured webhook endpoint must reject, never accept.
   */
  verifyWebhook(request: Request): Promise<boolean>;

  /**
   * Parses a verified body into the internal vocabulary. Called only after
   * `verifyWebhook` returns true.
   */
  parseWebhook(request: Request): Promise<CourierWebhookEvent>;
}

/* ------------------------------------------------------------------ registry */

export interface CourierProviderRegistry {
  listProviders(): CourierProviderView[];
  getView(code: string): CourierProviderView | null;
  /** Resolves a configured adapter, or `null` when unknown/misconfigured. */
  getProvider(code: string): CourierProvider | null;
  hasProvider(code: string): boolean;
}
