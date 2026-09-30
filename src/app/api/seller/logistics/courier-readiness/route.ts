import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireSellerRole } from '../../../_compat/shared';
import { listCourierProviders } from '@/features/courier/registry/providerRegistry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "What is still stopping this seller's shipments from being booked automatically?"
 *
 * Read entirely from `CourierStoreMapping`, not from the legacy `Warehouse.pathao*`
 * columns. The old version read those mirrored columns directly, which meant a
 * mapping that had been repaired through the generic admin endpoint still reported
 * this seller as unconfigured — the screen told the truth about the courier, and a
 * lie about the state we were actually in.
 *
 * Provider configuration is reported per provider rather than as one boolean: a
 * seller should not have to be told "ready" for a courier nobody has enabled.
 */
export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);

  try {
    const providers = listCourierProviders().map((provider) => ({
      code: provider.code,
      name: provider.name,
      // `setupStatus` comes from the adapter's own env check, so this stays
      // correct whether or not Pathao is the courier. Naming only the keys that
      // are missing keeps secrets out of the response.
      configured: provider.setupStatus === 'api_ready' && provider.lifecycle !== 'disabled',
      setupMessage: provider.setupMessage,
      missingConfig: provider.missingConfig,
      supportsPickupBooking: provider.supportsPickupBooking,
    }));

    const warehouses = await prisma.warehouse.findMany({
      where: { managerId: sellerId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    const warehouseIds = warehouses.map((warehouse) => warehouse.id);

    // Keyed by warehouse so a seller with several pickup points still sees every
    // blocker, instead of one combined verdict that hides which location is wrong.
    const mappings = warehouseIds.length
      ? await prisma.courierStoreMapping.findMany({ where: { warehouseId: { in: warehouseIds } } })
      : [];

    const mappingsByWarehouse = new Map<string, typeof mappings>();
    for (const mapping of mappings) {
      const bucket = mappingsByWarehouse.get(mapping.warehouseId);
      if (bucket) bucket.push(mapping);
      else mappingsByWarehouse.set(mapping.warehouseId, [mapping]);
    }

    const warehouseStates = warehouses.map((warehouse) => {
      const own = mappingsByWarehouse.get(warehouse.id) ?? [];
      const blockers: string[] = [];

      for (const mapping of own) {
        const prefix = providers.length > 1 ? `${mapping.provider}: ` : '';
        if (!mapping.externalStoreId) blockers.push(`${prefix}pickup point is not linked`);
        if (mapping.status !== 'approved') {
          blockers.push(`${prefix}pickup point is ${mapping.status} and not yet approved`);
        }
        if (!mapping.isActive) blockers.push(`${prefix}pickup point is disabled`);
        // A store id without a location mapping is the combination that produces
        // wrong-hub pickups, so it is called out separately from the store itself.
        if (mapping.cityId == null) blockers.push(`${prefix}city is not mapped`);
        if (mapping.zoneId == null) blockers.push(`${prefix}zone is not mapped`);
        if (mapping.areaId == null) blockers.push(`${prefix}area is not mapped`);
      }

      if (own.length === 0) blockers.push('no pickup point is linked to any courier');

      return {
        id: warehouse.id,
        name: warehouse.name,
        bookable: blockers.length === 0,
        blockers,
        couriers: own.map((mapping) => ({
          provider: mapping.provider,
          externalStoreId: mapping.externalStoreId || null,
          status: mapping.status,
          isActive: mapping.isActive,
        })),
      };
    });

    const bookableWarehouses = warehouseStates.filter((warehouse) => warehouse.bookable);

    return NextResponse.json({
      checked_at: new Date().toISOString(),
      seller_id: sellerId,
      providers,
      warehouses: warehouseStates,
      // Overall readiness is a conjunction: it is only true when some courier is
      // configured *and* at least one pickup point is actually bookable. Reporting
      // "ready" with zero bookable points would promise a booking that 400s.
      bookable: providers.some((provider) => provider.configured) && bookableWarehouses.length > 0,
      bookable_warehouse_count: bookableWarehouses.length,
      warehouse_count: warehouseStates.length,
    });
  } catch (error: any) {
    console.error('GET /api/seller/logistics/courier-readiness error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to check courier readiness' },
      { status: 500 },
    );
  }
}
