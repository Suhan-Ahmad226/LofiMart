import type {
  CourierProviderRegistry,
  ShipmentBookingInput,
} from './contracts';

export function createLogisticsModule(dependencies: {
  registry: CourierProviderRegistry;
}) {
  const { registry } = dependencies;

  return {
    listProviders() {
      return registry.listProviders();
    },

    async bookShipment(input: ShipmentBookingInput) {
      const adapter = registry.getProvider(input.providerCode);

      if (!adapter) {
        throw new Error('Selected courier provider is not available');
      }

      return adapter.bookShipment(input);
    },
  };
}
