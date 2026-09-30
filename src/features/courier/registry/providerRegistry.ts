/**
 * Courier provider registry.
 *
 * The single place that knows which couriers exist. Everything above this file
 * asks for a provider by code and receives a `CourierProvider`, so adding a
 * courier is a two-line change here plus a new adapter directory.
 *
 * Registration is explicit rather than discovered by scanning the filesystem:
 * a discovery mechanism would import every adapter (and therefore every
 * provider's env access and module side effects) on every request.
 */

import {
  CourierNotEnabledError,
  CourierUnsupportedError,
  isCourierError,
} from '../core/errors';
import type {
  CourierProvider,
  CourierProviderRegistry,
  CourierProviderView,
} from '../core/contracts';
import { pathaoProvider } from '../providers/pathao/pathaoProvider';

/** Presentation hints. No behavioural meaning. */
const PROVIDER_BRANDING: Record<string, { brandColor: string; shortLabel: string }> = {
  pathao: { brandColor: '#D7263D', shortLabel: 'Pathao' },
};

/**
 * The active provider set.
 *
 * Pathao is the only live courier. A second courier is added here, and nowhere
 * else in the codebase.
 */
const PROVIDERS: CourierProvider[] = [pathaoProvider];

function buildView(provider: CourierProvider): CourierProviderView {
  const status = provider.getStatus();
  const capabilities = provider.getCapabilities();
  const branding = PROVIDER_BRANDING[provider.code] ?? {};

  return {
    code: provider.code,
    name: provider.name,
    mode: 'api',
    lifecycle: status.lifecycle,
    health: status.health,
    capabilities,
    // Denormalised from `capabilities` so a component can read a plain boolean
    // instead of a capability key.
    supportsCod: capabilities.cod,
    supportsTrackingSync: capabilities.tracking,
    supportsPickupBooking: capabilities.createShipment,
    setupStatus: status.setupStatus,
    setupMessage: status.setupMessage,
    missingConfig: status.missingConfig,
    brandColor: branding.brandColor,
    shortLabel: branding.shortLabel ?? provider.name,
  };
}

class DefaultCourierRegistry implements CourierProviderRegistry {
  private readonly providers: CourierProvider[];

  constructor(providers: CourierProvider[]) {
    // Fail fast on a duplicate code at construction rather than resolving an
    // arbitrary adapter when two couriers share an id.
    const seen = new Set<string>();
    for (const provider of providers) {
      if (seen.has(provider.code)) {
        throw new Error(`Duplicate courier provider code: ${provider.code}`);
      }
      seen.add(provider.code);
    }
    this.providers = providers;
  }

  listProviders(): CourierProviderView[] {
    return this.providers.map(buildView);
  }

  getView(code: string): CourierProviderView | null {
    const provider = this.providers.find((entry) => entry.code === normalizeCode(code));
    return provider ? buildView(provider) : null;
  }

  /**
   * Resolves an adapter for booking, tracking and quoting.
   *
   * Throws rather than returning `null` for a known-but-disabled provider, so a
   * caller cannot accidentally treat "configured out" as "no courier chosen"
   * and silently skip delivery entirely.
   */
  getProvider(code: string): CourierProvider | null {
    const provider = this.providers.find((entry) => entry.code === normalizeCode(code));
    if (!provider) return null;

    if (provider.getStatus().lifecycle === 'disabled') {
      throw new CourierNotEnabledError(provider.code);
    }

    return provider;
  }

  hasProvider(code: string): boolean {
    return this.providers.some((entry) => entry.code === normalizeCode(code));
  }
}

function normalizeCode(code: string): string {
  return String(code || '').trim().toLowerCase();
}

const registry = new DefaultCourierRegistry(PROVIDERS);

export function listCourierProviders(): CourierProviderView[] {
  return registry.listProviders();
}

export function getCourierProviderView(code: string): CourierProviderView | null {
  return registry.getView(code);
}

export function getCourierProvider(code: string): CourierProvider | null {
  return registry.getProvider(code);
}

/**
 * Resolves a provider or throws a typed error.
 *
 * Use this wherever the courier is already known to be required: a booking route
 * that silently no-ops on a bad provider code would drop a parcel on the floor.
 */
export function requireCourierProvider(code: string): CourierProvider {
  const provider = registry.getProvider(code);

  if (!provider) {
    throw new CourierUnsupportedError(normalizeCode(code) || 'unknown');
  }

  return provider;
}

/**
 * Checks an operation against the provider's declared capabilities before
 * dispatching to it. Rejecting up front gives a clear error, where calling an
 * unimplemented method would fail deep inside the adapter.
 */
export function assertSupports(
  provider: CourierProvider,
  capability: 'quote' | 'createShipment' | 'tracking' | 'cancelShipment' | 'webhook',
): void {
  if (!provider.getCapabilities()[capability]) {
    throw new CourierUnsupportedError(provider.code);
  }
}

/** Test seam: lets a spec register a fake courier without touching production code. */
export function createRegistryForTests(providers: CourierProvider[]): CourierProviderRegistry {
  return new DefaultCourierRegistry(providers);
}

export { isCourierError, registry as courierRegistry };
