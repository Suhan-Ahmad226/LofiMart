import type { CourierAdapter, CourierProviderRegistry, CourierProviderView } from '../../../modules/logistics/contracts';
import { ManualCourierAdapter } from './manualCourierAdapter';
import { PathaoApiAdapter } from './pathaoApiAdapter';
import { getCourierProviderSetupStatus } from './providerConfig';
import { RedxApiAdapter } from './redxApiAdapter';
import { SteadfastApiAdapter } from './steadfastApiAdapter';

const baseProviders: CourierProviderView[] = [
  {
    code: 'redx',
    name: 'RedX',
    mode: 'manual',
    supportsCod: true,
    supportsTrackingSync: false,
    supportsPickupBooking: true,
    brandColor: '#e11d48',
    shortLabel: 'RX',
  },
  {
    code: 'pathao',
    name: 'Pathao Courier',
    mode: 'manual',
    supportsCod: true,
    supportsTrackingSync: false,
    supportsPickupBooking: true,
    brandColor: '#ef4444',
    shortLabel: 'PT',
  },
  {
    code: 'steadfast',
    name: 'Steadfast',
    mode: 'manual',
    supportsCod: true,
    supportsTrackingSync: false,
    supportsPickupBooking: true,
    brandColor: '#1d4ed8',
    shortLabel: 'ST',
  },
  {
    code: 'paperfly',
    name: 'Paperfly',
    mode: 'manual',
    supportsCod: true,
    supportsTrackingSync: false,
    supportsPickupBooking: true,
    brandColor: '#4f46e5',
    shortLabel: 'PF',
  },
];

function getProviders(): CourierProviderView[] {
  return baseProviders
    .map((provider) => {
      const setup = getCourierProviderSetupStatus(provider.code);
      return {
        ...provider,
        ...setup,
        mode: ['redx', 'pathao', 'steadfast'].includes(provider.code) && setup.setupStatus === 'api_ready' ? 'api' : provider.mode,
        supportsTrackingSync: ['redx', 'pathao', 'steadfast'].includes(provider.code) && setup.setupStatus === 'api_ready' ? true : provider.supportsTrackingSync,
      };
    });
}

class InMemoryCourierProviderRegistry implements CourierProviderRegistry {
  private createAdapter(provider: CourierProviderView): CourierAdapter {
    if (provider.code === 'redx' && provider.setupStatus === 'api_ready') {
      return new RedxApiAdapter(provider);
    }

    if (provider.code === 'pathao' && provider.setupStatus === 'api_ready') {
      return new PathaoApiAdapter(provider);
    }

    if (provider.code === 'steadfast' && provider.setupStatus === 'api_ready') {
      return new SteadfastApiAdapter(provider);
    }

    return new ManualCourierAdapter(provider);
  }

  listProviders(): CourierProviderView[] {
    return getProviders();
  }

  getProvider(code: string): CourierAdapter | null {
    const provider = getProviders().find((item) => item.code === String(code || '').toLowerCase());
    return provider ? this.createAdapter(provider) : null;
  }
}

export const courierProviderRegistry: CourierProviderRegistry = new InMemoryCourierProviderRegistry();
