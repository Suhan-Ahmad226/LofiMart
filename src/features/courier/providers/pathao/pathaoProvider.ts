/**
 * The Pathao implementation of the `CourierProvider` contract.
 *
 * This is the only object outside the service layer that knows Pathao exists.
 * Callers depend on `CourierProvider`, so adding a second courier means writing
 * a sibling adapter and registering it — no change here, in the services, or in
 * the UI.
 *
 * It performs no database access. Persistence belongs to the service layer, so
 * the adapter stays a pure translation boundary and is testable with a stubbed
 * `fetch`.
 */

import type {
  CourierBookingRequest,
  CourierBookingResult,
  CourierCancelResult,
  CourierDeliverySpeed,
  CourierHealthReport,
  CourierItemType,
  CourierLocationNode,
  CourierLocationRef,
  CourierProvider,
  CourierQuote,
  CourierQuoteRequest,
  CourierStoreCreateInput,
  CourierStoreCreateResult,
  CourierStoreRef,
  CourierTrackingRequest,
  CourierTrackingResult,
  CourierWebhookEvent,
} from '../../core/contracts';
import { CourierBookingError, CourierValidationError, CourierWebhookError } from '../../core/errors';
import { defineCapabilities, type CourierCapabilities } from '../../core/capabilities';
import { isInternalShipmentStatus } from '../../core/status';
import { PATHAO_PROVIDER_CODE, PATHAO_PROVIDER_NAME } from './pathaoConstants';
import {
  buildPathaoOrderPayload,
  buildPathaoPricePlanPayload,
  buildPathaoStorePayload,
  mapPathaoLocationNode,
  mapPathaoStatus,
  mapPathaoStoreCreateResult,
  mapPathaoStoreRow,
  normalizeBooleanFlag,
  parseProviderInteger,
  parseProviderMoney,
  pickPathaoStatusString,
  resolvePathaoPricePlan,
  toMoney,
} from './pathaoMapper';
import {
  calculatePathaoPrice,
  createPathaoOrder,
  createPathaoStore,
  getPathaoMissingConfig,
  getPathaoOrderInfo,
  getPathaoTokenDiagnostics,
  getPathaoWebhookSecret,
  listPathaoCities,
  listPathaoStores,
  listPathaoZones,
} from './pathaoClient';
import {
  extractPathaoListRows,
  readPathaoField,
} from './pathaoSchemas';
import { parsePathaoWebhookPayload, verifyPathaoWebhookSignature } from './pathaoWebhook';
import {
  fetchPathaoAreas,
  fetchPathaoZones,
  resolvePathaoLocation,
  toCourierLocationRef,
} from './pathaoLocation';

/** Pathao's 48h and 12h products, expressed in days for the quote contract. */
const ESTIMATED_DELIVERY_DAYS: Record<CourierDeliverySpeed, number> = {
  standard: 2,
  express: 1,
};

/**
 * Narrows an untyped response field to the numeric-or-numeric-string shape the
 * price mapper expects. Anything else becomes `null`, which the mapper treats as
 * "not supplied" rather than as zero.
 */
function asMoneyish(value: unknown): number | string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

function asFlagish(value: unknown): boolean | number | string | null {
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return value;
  return null;
}

/**
 * Pathao's capability set, declared in one place.
 *
 * Sourced from the Pathao Merchant API: it exposes price-plan, consignment
 * creation, order info, the city/zone/area hierarchy and webhooks. It has no
 * documented cancel, return or label endpoint, so those are `false` and the
 * seller/admin UI hides the corresponding actions instead of offering a button
 * that can only fail.
 */
export const PATHAO_CAPABILITIES: CourierCapabilities = defineCapabilities({
  quote: true,
  createShipment: true,
  tracking: true,
  cancelShipment: false,
  webhook: true,
  returnShipment: false,
  label: false,
  pickupRequest: true,
  cod: true,
  bulkBooking: true,
  locationLookup: true,
  storeManagement: true,
  // Pathao's API can only be queried by consignment id, and an ambiguous
  // booking is precisely the case where we do not have one. Declared false so
  // reconciliation escalates to an operator instead of guessing.
  referenceLookup: false,
});

export class PathaoProvider implements CourierProvider {
  readonly code = PATHAO_PROVIDER_CODE;
  readonly name = PATHAO_PROVIDER_NAME;

  getCapabilities(): CourierCapabilities {
    return PATHAO_CAPABILITIES;
  }

  getStatus() {
    const missingConfig = getPathaoMissingConfig();

    if (missingConfig.length > 0) {
      return {
        lifecycle: 'disabled' as const,
        health: 'unknown' as const,
        setupStatus: 'missing_config' as const,
        setupMessage: `Add ${missingConfig.join(', ')} to the server environment.`,
        missingConfig,
      };
    }

    return {
      lifecycle: 'enabled' as const,
      health: 'healthy' as const,
      setupStatus: 'api_ready' as const,
      setupMessage: 'Pathao is ready to quote, book and track.',
      missingConfig: [] as string[],
    };
  }

  /**
   * Maps a merchant city to a Pathao location.
   *
   * Returns `null` for an unmapped city. The contract requires this: a guessed
   * city produces a wrong price and a misrouted parcel.
   */
  async resolveLocation(input: {
    city?: string | null;
    zone?: string | null;
    area?: string | null;
  }): Promise<CourierLocationRef | null> {
    const resolution = await resolvePathaoLocation(input);
    return toCourierLocationRef(resolution);
  }

  /**
   * Pathao exposes home-delivery and pickup availability per area, but only as
   * per-area booleans on the area list rather than a serviceability endpoint.
   * Absent that data, delivery is treated as serviceable: refusing to quote would
   * block every checkout. Genuinely unserviceable areas fail later at the price
   * plan, which is authoritative.
   */
  async isLocationServiceable(input: {
    location: CourierLocationRef;
    deliverySpeed: CourierDeliverySpeed;
  }): Promise<boolean> {
    const { location } = input;
    if (location.zoneId === null) return false;

    try {
      const areas = await fetchPathaoAreas(location.zoneId);
      if (areas.length === 0) return true;

      const area = areas.find((entry) => entry.area_id === location.areaId);
      if (!area) return true;

      // An explicit `0`/`"0"`/`false` means the courier will not collect there.
      return normalizeBooleanFlag(area.pickup_available);
    } catch {
      // Never block checkout on a diagnostics lookup failing.
      return true;
    }
  }

  /**
   * Exposes Pathao's three-level hierarchy in the provider-neutral shape the admin
   * location pickers consume, so those screens need no knowledge of Pathao.
   *
   * Zones are read through the caching helper rather than the raw client, because
   * a seller paging through areas re-requests the same zone list on every step.
   */
  async listLocations(input: {
    level: CourierLocationNode['level'];
    parentId?: string | null;
  }): Promise<CourierLocationNode[]> {
    const { level } = input;

    if (level === 'city') {
      const rows = extractPathaoListRows(await listPathaoCities());
      return rows
        .map((row) => mapPathaoLocationNode(row, 'city', null))
        .filter((node): node is CourierLocationNode => node !== null);
    }

    if (level === 'zone') {
      const cityId = Number(input.parentId);
      if (!Number.isFinite(cityId) || cityId <= 0) {
        throw new CourierValidationError(PATHAO_PROVIDER_CODE, 'A valid city is required to list zones.');
      }
      const zones = await fetchPathaoZones(cityId);
      return zones.map((zone) => ({
        id: String(zone.zone_id),
        name: zone.zone_name,
        level: 'zone' as const,
        parentId: String(cityId),
        homeDeliveryAvailable: null,
        pickupAvailable: null,
      }));
    }

    if (level === 'area') {
      const zoneId = Number(input.parentId);
      if (!Number.isFinite(zoneId) || zoneId <= 0) {
        throw new CourierValidationError(PATHAO_PROVIDER_CODE, 'A valid zone is required to list areas.');
      }
      const areas = await fetchPathaoAreas(zoneId);
      return areas
        .map((area) =>
          mapPathaoLocationNode(
            {
              area_id: area.area_id,
              area_name: area.area_name,
              home_delivery_available: area.home_delivery_available,
              pickup_available: area.pickup_available,
            },
            'area',
            String(zoneId),
          ),
        )
        .filter((node): node is CourierLocationNode => node !== null);
    }

    throw new CourierValidationError(
      PATHAO_PROVIDER_CODE,
      `Pathao does not publish a "${level}" location level.`,
    );
  }

  /* ---------------------------------------------------------------- stores */

  async listStores(): Promise<CourierStoreRef[]> {
    const rows = extractPathaoListRows(await listPathaoStores());
    return rows
      .map((row) => mapPathaoStoreRow(row))
      .filter((store): store is CourierStoreRef => store !== null);
  }

  /**
   * Registers a pickup point.
   *
   * Pathao's create response carries only the store name, not the new id, and a
   * newly created store sits in review for up to an hour. Both are reported
   * honestly: the service layer re-lists stores to discover the id, and the
   * seller UI shows "under review" rather than "ready to book".
   */
  async createStore(input: CourierStoreCreateInput): Promise<CourierStoreCreateResult> {
    const payload = buildPathaoStorePayload({
      name: input.name,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      secondaryPhone: input.secondaryPhone,
      otpNumber: input.otpNumber,
      address: input.address,
      location: input.location,
    });

    const response = await createPathaoStore(payload);
    const result = mapPathaoStoreCreateResult(response);

    return {
      provider: PATHAO_PROVIDER_CODE,
      // Unknown until the store is listed back; the service reconciles it.
      externalStoreId: null,
      externalStoreName: result.externalStoreName ?? payload.name,
      approved: false,
      message: result.message ?? 'Store submitted to Pathao and awaiting approval.',
    };
  }

  /**
   * Reads one pickup point back from the courier.
   *
   * Resolved by listing rather than by fetching `GET /stores/{id}`: the list is a
   * documented endpoint, a single-store fetch is not, and an undocumented path that
   * starts returning 404 or a differently-shaped payload would take out pickup
   * verification with no code change to notice. The list is small (a merchant has
   * tens of stores, not thousands) and `listStores` already has a working request
   * path, so the extra call buys correctness rather than costing anything.
   */
  async getStore(externalStoreId: string): Promise<CourierStoreRef | null> {
    const target = externalStoreId.trim();
    if (!target) return null;

    const rows = extractPathaoListRows(await listPathaoStores());
    const match = rows.find((row) => {
      const mapped = mapPathaoStoreRow(row);
      return mapped?.externalStoreId === target;
    });

    return match ? mapPathaoStoreRow(match) : null;
  }

  /* ---------------------------------------------------------------- health */

  /**
   * Probes the live API.
   *
   * Uses the city list because it is the cheapest authenticated read Pathao
   * offers, and it exercises the whole chain: config presence, OAuth issuance,
   * the cached token and the outbound request. A courier that is unreachable is
   * reported as `healthy: false` rather than thrown, because the admin screen
   * exists precisely to explain an outage.
   */
  async checkHealth(): Promise<CourierHealthReport> {
    const checkedAt = new Date().toISOString();
    const missingConfig = getPathaoMissingConfig();
    const diagnostics = await getPathaoTokenDiagnostics();

    if (missingConfig.length > 0) {
      return {
        provider: PATHAO_PROVIDER_CODE,
        healthy: false,
        missingConfig,
        tokenState: {
          hasCachedToken: diagnostics.hasCachedToken === true,
          expiresAt: (diagnostics.expiresAt as string | null) ?? null,
          refreshAvailable: diagnostics.refreshTokenAvailable === true,
        },
        webhookConfigured: Boolean(getPathaoWebhookSecret()),
        latencyMs: null,
        message: `Pathao is not configured. Missing: ${missingConfig.join(', ')}.`,
        checkedAt,
      };
    }

    const startedAt = Date.now();
    try {
      await listPathaoCities();
      return {
        provider: PATHAO_PROVIDER_CODE,
        healthy: true,
        missingConfig: [],
        tokenState: {
          hasCachedToken: diagnostics.hasCachedToken === true,
          expiresAt: (diagnostics.expiresAt as string | null) ?? null,
          refreshAvailable: diagnostics.refreshTokenAvailable === true,
        },
        webhookConfigured: Boolean(getPathaoWebhookSecret()),
        latencyMs: Date.now() - startedAt,
        message: 'Pathao responded successfully.',
        checkedAt,
      };
    } catch (error) {
      return {
        provider: PATHAO_PROVIDER_CODE,
        healthy: false,
        missingConfig: [],
        tokenState: {
          hasCachedToken: diagnostics.hasCachedToken === true,
          expiresAt: (diagnostics.expiresAt as string | null) ?? null,
          refreshAvailable: diagnostics.refreshTokenAvailable === true,
        },
        webhookConfigured: Boolean(getPathaoWebhookSecret()),
        latencyMs: Date.now() - startedAt,
        // Only the classified error name reaches the UI. The raw provider body
        // stays in the server log.
        message:
          error instanceof Error
            ? `Pathao is unreachable: ${error.name}.`
            : 'Pathao is unreachable.',
        checkedAt,
      };
    }
  }

  async getQuote(request: CourierQuoteRequest): Promise<CourierQuote> {
    if (!request.pickupStore) {
      throw new CourierValidationError(
        PATHAO_PROVIDER_CODE,
        'No courier pickup store is configured for this seller.',
      );
    }

    const payload = buildPathaoPricePlanPayload({
      store: request.pickupStore,
      recipientLocation: request.recipientLocation,
      weightKg: request.weightKg,
      itemType: request.itemType,
      deliverySpeed: request.deliverySpeed,
    });

    const response = await calculatePathaoPrice(payload);

    const finalPrice = readPathaoField(response, 'final_price');
    const price = readPathaoField(response, 'price');
    const additionalCharge = readPathaoField(response, 'additional_charge');
    const codPercentage = readPathaoField(response, 'cod_percentage');
    const codEnabled = readPathaoField(response, 'cod_enabled');
    const codAmount = request.codAmount ?? 0;

    const resolved = resolvePathaoPricePlan({
      finalPrice: asMoneyish(finalPrice),
      price: asMoneyish(price),
      additionalCharge: asMoneyish(additionalCharge),
      codPercentage: asMoneyish(codPercentage),
      codEnabled: asFlagish(codEnabled),
      codAmount,
    });

    const discount =
      parseProviderMoney(readPathaoField(response, 'discount')) ??
      parseProviderMoney(readPathaoField(response, 'promo_discount')) ??
      0;

    const planReference = readPathaoField(response, 'plan_id');

    return {
      provider: PATHAO_PROVIDER_CODE,
      // The customer pays the courier's list price. A platform margin would go
      // here explicitly, never as an unexplained difference from courierCharge.
      customerDeliveryFee: toMoney(resolved.courierCharge + resolved.additionalCharge - discount),
      courierCharge: resolved.courierCharge,
      codFee: resolved.codFee,
      discount,
      additionalCharge: resolved.additionalCharge,
      totalPrice: toMoney(
        resolved.courierCharge + resolved.codFee + resolved.additionalCharge - discount,
      ),
      currency: 'BDT',
      estimatedDeliveryDays: ESTIMATED_DELIVERY_DAYS[request.deliverySpeed],
      codEnabled: resolved.codEnabled && codAmount > 0,
      planReference: planReference === undefined || planReference === null ? null : String(planReference),
      metadata: { weightKg: request.weightKg, itemType: request.itemType },
    };
  }

  async createShipment(request: CourierBookingRequest): Promise<CourierBookingResult> {
    const payload = buildPathaoOrderPayload(request);
    const response = await createPathaoOrder(payload);

    const externalShipmentId = parseProviderInteger(readPathaoField(response, 'consignment_id'));

    if (externalShipmentId === null) {
      // A 2xx without a consignment id means the outcome is unknown: the parcel
      // may exist at Pathao. Reported as uncertain so the service reconciles
      // instead of booking a second one.
      throw new CourierBookingError(
        PATHAO_PROVIDER_CODE,
        'Pathao accepted the request but returned no consignment id. The parcel may have been created; reconcile before retrying.',
      );
    }

    const providerStatus = pickPathaoStatusString(
      response as { order_status_slug?: unknown; order_status?: unknown; event?: unknown },
    );
    const status = mapPathaoStatus(providerStatus) ?? 'processing';

    // Pathao does not always echo the reference. When it does, the echo is
    // checked here so a mismatched consignment is caught at the boundary.
    const echoedReference = readPathaoField(response, 'merchant_order_id');
    if (typeof echoedReference === 'string' && echoedReference !== request.merchantReference) {
      throw new CourierBookingError(
        PATHAO_PROVIDER_CODE,
        'Pathao echoed a different merchant reference than the one that was sent.',
      );
    }

    return {
      provider: PATHAO_PROVIDER_CODE,
      externalShipmentId: String(externalShipmentId),
      merchantReference: typeof echoedReference === 'string' ? echoedReference : request.merchantReference,
      status: isInternalShipmentStatus(status) ? status : 'processing',
      providerStatus,
      courierCharge: parseProviderMoney(readPathaoField(response, 'delivery_fee')),
      codFee: null,
      codAmount: request.codAmount,
      trackingNumber: String(externalShipmentId),
      notes: null,
      metadata: { createdAt: new Date().toISOString() },
    };
  }

  async getShipmentStatus(request: CourierTrackingRequest): Promise<CourierTrackingResult> {
    const response = await getPathaoOrderInfo(request.externalShipmentId);

    const providerStatus = pickPathaoStatusString(
      response as { order_status_slug?: unknown; order_status?: unknown; event?: unknown },
    );
    const occurredAt = readPathaoField(response, 'updated_at');

    return {
      provider: PATHAO_PROVIDER_CODE,
      externalShipmentId: request.externalShipmentId,
      status: mapPathaoStatus(providerStatus),
      providerStatus,
      courierCharge: parseProviderMoney(readPathaoField(response, 'delivery_fee')),
      events: [
        {
          providerStatus,
          status: mapPathaoStatus(providerStatus),
          description: providerStatus,
          location: null,
          occurredAt: typeof occurredAt === 'string' ? occurredAt : null,
        },
      ],
      metadata: null,
    };
  }

  /**
   * Pathao's public Merchant API has no consignment-cancel endpoint; a pickup
   * must be cancelled through support. Reporting it as unsupported keeps the UI
   * from offering an action that cannot work.
   */
  async cancelShipment(): Promise<CourierCancelResult> {
    return {
      provider: PATHAO_PROVIDER_CODE,
      success: false,
      message: 'Pathao does not expose API cancellation. Cancel the pickup with Pathao support.',
    };
  }

  async verifyWebhook(request: Request): Promise<boolean> {
    return verifyPathaoWebhookSignature(request);
  }

  async parseWebhook(request: Request): Promise<CourierWebhookEvent> {
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      throw new CourierWebhookError(PATHAO_PROVIDER_CODE, 'Webhook body was not valid JSON.');
    }

    return parsePathaoWebhookPayload(payload);
  }
}

/** Shared instance. The adapter is stateless, so one is enough. */
export const pathaoProvider = new PathaoProvider();

export type { CourierItemType };
