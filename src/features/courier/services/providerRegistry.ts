import type { CourierAdapter, CourierProviderRegistry, CourierProviderView } from '@/src/modules/logistics/contracts';
import { PathaoApiAdapter } from './pathaoApiAdapter';
import { getCourierProviderSetupStatus } from './providerConfig';

const pathaoProvider: CourierProviderView = {
  code: 'pathao',
  name: 'Pathao Courier',
  mode: 'manual',
  supportsCod: true,
  supportsTrackingSync: false,
  supportsPickupBooking: true,
  brandColor: '#ef4444',
  shortLabel: 'PT',
};

function getProviders(): CourierProviderView[] {
  const setup = getCourierProviderSetupStatus('pathao');
  return [{
    ...pathaoProvider,
    ...setup,
    mode: setup.setupStatus === 'api_ready' ? 'api' : pathaoProvider.mode,
    supportsTrackingSync: setup.setupStatus === 'api_ready',
  }];
}

class InMemoryCourierProviderRegistry implements CourierProviderRegistry {
  listProviders(): CourierProviderView[] {
    return getProviders();
  }

  getProvider(code: string): CourierAdapter | null {
    if (String(code || '').toLowerCase() !== 'pathao') return null;
    const provider = getProviders()[0];
    return new PathaoApiAdapter(provider);
  }
}

export const courierProviderRegistry: CourierProviderRegistry = new InMemoryCourierProviderRegistry();
