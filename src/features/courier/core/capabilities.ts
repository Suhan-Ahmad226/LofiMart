/**
 * Provider capabilities.
 *
 * Not every courier does the same things. Pathao has no cancel endpoint, no
 * label endpoint and no return API; a future courier might have all three. The
 * UI asks "does this provider support cancellation?" rather than "is this
 * provider called Pathao?", so a new courier's supported operations appear
 * without touching a single component.
 *
 * Every capability is declared, never optional. A provider that does not
 * implement an operation sets it to `false` and omits the method from its
 * adapter; the registry uses this to reject a call that cannot succeed instead
 * of letting it fail deep inside the adapter.
 */

export type CourierCapabilities = {
  /** Server-side price calculation for a parcel. */
  quote: boolean;
  /** Create a consignment / pickup request. */
  createShipment: boolean;
  /** Read the current status of an existing consignment. */
  tracking: boolean;
  /** Cancel an existing consignment. */
  cancelShipment: boolean;
  /** Receive asynchronous status pushes. */
  webhook: boolean;
  /** Create a return/return-to-origin request. */
  returnShipment: boolean;
  /** Produce a shipping label. */
  label: boolean;
  /** Request a pickup without creating a consignment first. */
  pickupRequest: boolean;
  /** Cash on delivery. */
  cod: boolean;
  /** Bulk booking of many consignments in one call. */
  bulkBooking: boolean;
  /** Provider-side location hierarchy usable for address validation. */
  locationLookup: boolean;
  /**
   * Register and read pickup points on the provider's own account.
   *
   * Distinct from `locationLookup`: some couriers publish a serviceable-area list
   * without exposing store registration through the API. The seller onboarding
   * flow that maps a warehouse to a courier pickup point is gated on this.
   */
  storeManagement: boolean;
  /**
   * Look a consignment up by the reference we sent, without knowing its id.
   *
   * This is what makes an ambiguous booking recoverable: when a create call's
   * response is lost, the only way to learn whether a parcel exists is to search
   * for the reference. Pathao has no such endpoint, so it declares this `false`
   * and such bookings can only be resolved by a human. A courier that does
   * support the lookup lets the platform resolve them unattended.
   */
  referenceLookup: boolean;
};

export type CourierCapabilityName = keyof CourierCapabilities;

export const COURIER_CAPABILITY_NAMES: readonly CourierCapabilityName[] = [
  'quote',
  'createShipment',
  'tracking',
  'cancelShipment',
  'webhook',
  'returnShipment',
  'label',
  'pickupRequest',
  'cod',
  'bulkBooking',
  'locationLookup',
  'storeManagement',
  'referenceLookup',
];

const NO_CAPABILITIES: CourierCapabilities = {
  quote: false,
  createShipment: false,
  tracking: false,
  cancelShipment: false,
  webhook: false,
  returnShipment: false,
  label: false,
  pickupRequest: false,
  cod: false,
  bulkBooking: false,
  locationLookup: false,
  storeManagement: false,
  referenceLookup: false,
};

/**
 * Builds a complete capability object from a partial declaration so a provider
 * never has to spell out the operations it does not support, and the object is
 * always safe to read without optional chaining in the UI.
 */
export function defineCapabilities(partial: Partial<CourierCapabilities>): CourierCapabilities {
  return { ...NO_CAPABILITIES, ...partial };
}

export function supports(provider: { capabilities?: CourierCapabilities } | null | undefined, name: CourierCapabilityName): boolean {
  return provider?.capabilities?.[name] === true;
}

/** Only capabilities a provider advertises are worth rendering in the UI. */
export function listSupportedCapabilities(capabilities: CourierCapabilities | null | undefined) {
  if (!capabilities) return [] as CourierCapabilityName[];
  return COURIER_CAPABILITY_NAMES.filter((name) => capabilities[name]);
}

/** Human labels so the UI never invents its own capability wording. */
const CAPABILITY_LABELS: Record<CourierCapabilityName, string> = {
  quote: 'Shipping quote',
  createShipment: 'Create shipment',
  tracking: 'Tracking',
  cancelShipment: 'Cancel shipment',
  webhook: 'Webhook',
  returnShipment: 'Return shipment',
  label: 'Label',
  pickupRequest: 'Pickup request',
  cod: 'Cash on delivery',
  bulkBooking: 'Bulk booking',
  locationLookup: 'Location lookup',
  storeManagement: 'Store management',
  referenceLookup: 'Lookup by reference',
};

export function getCapabilityLabel(name: CourierCapabilityName): string {
  return CAPABILITY_LABELS[name];
}
