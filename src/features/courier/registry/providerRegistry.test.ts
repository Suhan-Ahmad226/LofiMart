import { describe, expect, it } from 'vitest';

import { defineCapabilities } from '../core/capabilities';
import {
  CourierBookingError,
  CourierNotEnabledError,
  CourierUnsupportedError,
} from '../core/errors';
import type {
  CourierBookingRequest,
  CourierBookingResult,
  CourierLocationRef,
  CourierProvider,
  CourierProviderView,
  CourierQuote,
  CourierQuoteRequest,
  CourierTrackingRequest,
  CourierTrackingResult,
  CourierWebhookEvent,
} from '../core/contracts';
import {
  assertSupports,
  createRegistryForTests,
  getCourierProvider,
  getCourierProviderView,
  listCourierProviders,
  requireCourierProvider,
} from './providerRegistry';
import { PATHAO_CAPABILITIES, pathaoProvider } from '../providers/pathao/pathaoProvider';

/**
 * A second courier defined entirely outside the core.
 *
 * Nothing in `core/` changes to support it. If a future test needs to edit a
 * core file to add a courier, the abstraction has leaked.
 */
class FakeProvider implements CourierProvider {
  readonly code = 'fakecourier';
  readonly name = 'Fake Courier';

  getCapabilities() {
    return defineCapabilities({
      quote: true,
      createShipment: true,
      tracking: true,
      cancelShipment: true,
      cod: false,
    });
  }

  getStatus(): ReturnType<CourierProvider['getStatus']> {
    return {
      lifecycle: 'enabled',
      health: 'healthy',
      setupStatus: 'api_ready',
      setupMessage: 'Ready.',
      missingConfig: [],
    };
  }

  async resolveLocation(): Promise<CourierLocationRef | null> {
    return { provider: 'fakecourier', cityId: 1, zoneId: 1, areaId: 1, label: 'Testville' };
  }

  async getQuote(_request: CourierQuoteRequest): Promise<CourierQuote> {
    return {
      provider: 'fakecourier',
      customerDeliveryFee: 50,
      courierCharge: 50,
      codFee: 0,
      discount: 0,
      additionalCharge: 0,
      totalPrice: 50,
      currency: 'BDT',
      estimatedDeliveryDays: 3,
      codEnabled: false,
      planReference: null,
    };
  }

  async createShipment(_request: CourierBookingRequest): Promise<CourierBookingResult> {
    return {
      provider: 'fakecourier',
      externalShipmentId: 'FK-1',
      merchantReference: 'LFM-1',
      status: 'processing',
      providerStatus: 'ACCEPTED',
      courierCharge: 50,
      codFee: 0,
      codAmount: 0,
      trackingNumber: 'FK-1',
      notes: null,
    };
  }

  async getShipmentStatus(_request: CourierTrackingRequest): Promise<CourierTrackingResult> {
    return {
      provider: 'fakecourier',
      externalShipmentId: 'FK-1',
      status: 'delivered',
      providerStatus: 'DELIVERED',
      courierCharge: 50,
      events: [],
    };
  }

  async verifyWebhook(): Promise<boolean> {
    return true;
  }

  async parseWebhook(): Promise<CourierWebhookEvent> {
    throw new CourierBookingError('fakecourier', 'not implemented in the fake');
  }
}

describe('production registry', () => {
  it('registers exactly one provider, with no legacy couriers', () => {
    const codes = listCourierProviders().map((provider) => provider.code);
    expect(codes).toEqual(['pathao']);
  });

  it('exposes the Pathao view with its capabilities denormalised', () => {
    const view = getCourierProviderView('pathao');
    expect(view).not.toBeNull();
    expect(view?.name).toBe('Pathao Courier');
    expect(view?.supportsCod).toBe(true);
    expect(view?.supportsPickupBooking).toBe(true);
    expect(view?.capabilities).toEqual(PATHAO_CAPABILITIES);
  });

  it('reports Pathao as not supporting cancellation, matching the real API', () => {
    // The UI relies on this to hide a button that could only fail.
    expect(getCourierProviderView('pathao')?.capabilities.cancelShipment).toBe(false);
    expect(getCourierProviderView('pathao')?.capabilities.label).toBe(false);
  });

  it('resolves a provider code case-insensitively', () => {
    expect(getCourierProviderView('PATHAO')?.code).toBe('pathao');
    expect(getCourierProviderView('  Pathao  ')?.code).toBe('pathao');
  });

  it('returns null for an unknown provider', () => {
    expect(getCourierProvider('nope')).toBeNull();
    expect(getCourierProviderView('nope')).toBeNull();
  });

  it('throws a typed error from requireCourierProvider', () => {
    expect(() => requireCourierProvider('nope')).toThrow(CourierUnsupportedError);
  });

  it('lists Pathao as viewable even when it has no credentials', () => {
    // The admin diagnostics screen must be able to explain a missing-config
    // deployment, which means the provider is listable while not dispatchable.
    const view = getCourierProviderView('pathao');
    expect(view).not.toBeNull();
    expect(view?.setupStatus).toBe('missing_config');
    expect(view?.missingConfig.length).toBeGreaterThan(0);
    expect(view?.lifecycle).toBe('disabled');
  });
});

describe('capability guards', () => {
  it('allows a declared capability', () => {
    expect(() => assertSupports(pathaoProvider, 'createShipment')).not.toThrow();
    expect(() => assertSupports(pathaoProvider, 'quote')).not.toThrow();
  });

  it('rejects an undeclared capability before dispatching', () => {
    // Pathao's Merchant API has no cancel or label endpoint, so the guard has to
    // stop the call rather than let it fail inside the adapter.
    expect(() => assertSupports(pathaoProvider, 'cancelShipment')).toThrow(
      CourierUnsupportedError,
    );
    expect(() => assertSupports(pathaoProvider, 'label' as 'quote')).toThrow(
      CourierUnsupportedError,
    );
  });
});

describe('extensibility', () => {
  it('supports a second courier with no change to core', () => {
    const registry = createRegistryForTests([pathaoProvider, new FakeProvider()]);

    expect(registry.listProviders().map((view) => view.code)).toEqual(['pathao', 'fakecourier']);
    expect(registry.hasProvider('fakecourier')).toBe(true);
    expect(registry.getProvider('fakecourier')?.code).toBe('fakecourier');
  });

  it('builds a correct view for the new courier from its declared capabilities', () => {
    const registry = createRegistryForTests([new FakeProvider()]);
    const view = registry.getView('fakecourier') as CourierProviderView;

    expect(view.supportsCod).toBe(false);
    expect(view.supportsPickupBooking).toBe(true);
    expect(view.lifecycle).toBe('enabled');
    expect(view.shortLabel).toBe('Fake Courier');
  });

  it('rejects a duplicate provider code at construction', () => {
    expect(() => createRegistryForTests([pathaoProvider, pathaoProvider])).toThrow(/Duplicate/i);
  });

  it('refuses to resolve a provider that reports itself disabled', () => {
    const disabled = new FakeProvider();
    disabled.getStatus = () => ({
      lifecycle: 'disabled' as const,
      health: 'unknown' as const,
      setupStatus: 'missing_config' as const,
      setupMessage: 'Add FAKECOURIER_API_KEY.',
      missingConfig: ['FAKECOURIER_API_KEY'],
    });

    const registry = createRegistryForTests([disabled]);

    // Present in the list so the admin UI can show what needs configuring...
    expect(registry.listProviders()).toHaveLength(1);
    // ...but not dispatchable, so a booking cannot silently go nowhere.
    expect(() => registry.getProvider('fakecourier')).toThrow(CourierNotEnabledError);
  });

  it('lists a misconfigured provider with the missing key names but no values', () => {
    const misconfigured = new FakeProvider();
    misconfigured.getStatus = () => ({
      lifecycle: 'disabled' as const,
      health: 'unknown' as const,
      setupStatus: 'missing_config' as const,
      setupMessage: 'Add FAKECOURIER_API_KEY.',
      missingConfig: ['FAKECOURIER_API_KEY'],
    });

    const view = createRegistryForTests([misconfigured]).getView('fakecourier');
    expect(view?.setupStatus).toBe('missing_config');
    expect(view?.missingConfig).toEqual(['FAKECOURIER_API_KEY']);
  });
});
