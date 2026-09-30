/**
 * Compatibility facade for the courier registry.
 *
 * The active Pathao-only registry lives under ./registry and the provider
 * contract lives under ./core. This file is kept as a stable import surface for
 * older service code while avoiding imports of the removed legacy adapter files.
 */

export {
  courierRegistry as courierProviderRegistry,
  listCourierProviders,
  getCourierProviderView,
  getCourierProvider,
  requireCourierProvider,
  assertSupports,
  createRegistryForTests,
  isCourierError,
} from '../registry/providerRegistry';
