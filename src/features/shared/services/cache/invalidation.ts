import { deleteCacheByPrefix } from './store';

export async function invalidateProductCache(productId?: string) {
  await Promise.all([
    deleteCacheByPrefix('inventory:'),
    deleteCacheByPrefix('seller:'),
    deleteCacheByPrefix('product:'),
    ...(productId ? [deleteCacheByPrefix(`product:${productId}`)] : []),
  ]);
}

export async function invalidateInventoryCache(sellerId?: string) {
  await Promise.all([
    deleteCacheByPrefix('inventory:'),
    ...(sellerId ? [deleteCacheByPrefix(`seller:${sellerId}:inventory`), deleteCacheByPrefix(`seller:${sellerId}:inventory-alerts`)] : []),
  ]);
}

export async function invalidatePricingCache(productId?: string) {
  await Promise.all([
    deleteCacheByPrefix('pricing:'),
    ...(productId ? [deleteCacheByPrefix(`product:${productId}`)] : []),
  ]);
}
