import { NextRequest, NextResponse } from 'next/server';

// Admin-wide, cross-tenant view: the tenant-scoped client would either return
// nothing or depend on ambient context here, neither of which is what an operator
// dashboard should show.
import { prismaDirect as prisma } from '@/features/shared/services/database/prisma';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { listCourierProviders } from '@/features/courier/registry/providerRegistry';
import { checkCourierHealth } from '@/features/courier/services/courierAdminService';
import { isCourierError } from '@/features/courier/core/errors';
import type { CourierHealthReport, CourierLocationNode } from '@/features/courier/core/contracts';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Operator dashboard data for the whole courier system.
 *
 * Provider-neutral by construction. This used to read `Warehouse.pathao*` columns
 * and `process.env.PATHAO_*` directly, which meant a second courier would have
 * needed a new branch here and the dashboard could not tell an operator anything
 * about a courier it did not have columns for. It now asks each registered adapter
 * what its state is and joins that against `CourierStoreMapping`, which is
 * provider-neutral by schema.
 *
 * `?probe=1` adds a live API round-trip per provider. It is opt-in because every
 * probe is a real authenticated call, and an auto-refreshing dashboard should not
 * spend the merchant's API quota.
 */

const EXCEPTION_STATUSES = [
  'cancelled',
  'returned',
  'delivery_failed',
] as const;

const ACTIVE_STATUSES = [
  'processing',
  'packed',
  'ready_for_pickup',
  'pickup_requested',
  'picked_up',
  'in_transit',
  'out_for_delivery',
] as const;

/** A location mapping is only usable when the provider accepted it. */
function isMappedLocation(value: unknown): value is {
  cityId: number | null;
  zoneId: number | null;
  areaId: number | null;
} {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.cityId === 'number' &&
    typeof row.zoneId === 'number' &&
    typeof row.areaId === 'number'
  );
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hoursSince(value?: Date | string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 36_000) / 100);
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['admin'])(user);
  if (roleError) return roleError;

  const liveProbe = new URL(request.url).searchParams.get('probe') === '1';
  const providerViews = listCourierProviders();

  // A probe failure is a health finding, not a request failure: the whole point
  // of this endpoint is to explain a broken courier.
  //
  // Probes only run when explicitly asked for. This dashboard auto-refreshes, and
  // each probe is a real authenticated call against the courier, so probing on
  // every load would spend the merchant's API quota on a page that renders
  // numbers nobody acts on.
  const healthReports = liveProbe
    ? await Promise.all(
        providerViews.map(async (view): Promise<CourierHealthReport> => {
          try {
            return await checkCourierHealth(view.code);
          } catch (error) {
            logger.warn('Courier health probe threw.', {
              provider: view.code,
              reason: error instanceof Error ? error.message : 'Unknown error',
            });
            return {
              provider: view.code,
              healthy: false,
              missingConfig: isCourierError(error) ? [error.code] : [],
              tokenState: { hasCachedToken: false, expiresAt: null, refreshAvailable: false },
              webhookConfigured: false,
              latencyMs: null,
              message: 'The health probe could not complete.',
              checkedAt: new Date().toISOString(),
            };
          }
        }),
      )
    : [];

  const [warehouses, mappings, activeShipments, exceptionShipments, backlog] = await Promise.all([
    prisma.warehouse.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        city: true,
        insideDhakaFee: true,
        outsideDhakaFee: true,
        insideDhakaEta: true,
        outsideDhakaEta: true,
      },
    }),
    prisma.courierStoreMapping.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        provider: true,
        warehouseId: true,
        externalStoreId: true,
        externalStoreName: true,
        status: true,
        isActive: true,
        cityId: true,
        zoneId: true,
        areaId: true,
        lastError: true,
        updatedAt: true,
      },
    }),
    prisma.orderShipment.findMany({
      where: { status: { in: [...ACTIVE_STATUSES] } },
      include: { order: { include: { user: true } }, warehouse: true },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    }),
    prisma.orderShipment.findMany({
      where: {
        OR: [
          { status: { in: [...EXCEPTION_STATUSES] } },
          { deliveryFailureReason: { not: null } },
        ],
      },
      include: { order: { include: { user: true } }, warehouse: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.orderShipment.count({
      where: { bookingState: { in: ['pending', 'uncertain', 'failed'] } },
    }),
  ]);

  const mappingByWarehouse = new Map<string, (typeof mappings)[number]>();
  for (const mapping of mappings) {
    if (!mappingByWarehouse.has(mapping.warehouseId)) {
      mappingByWarehouse.set(mapping.warehouseId, mapping);
    }
  }

  const providerCode = (warehouseId: string): string | null =>
    mappingByWarehouse.get(warehouseId)?.provider ?? null;

  // Read from the mapping, not the legacy `Warehouse.pathao*` mirror columns. The
  // mirror can disagree with the mapping after a repair through the generic
  // admin endpoint, and a dashboard that trusts the mirror would report a fixed
  // pickup point as still broken.
  const locationMapped = warehouses.filter(
    (warehouse) => isMappedLocation(mappingByWarehouse.get(warehouse.id)),
  ).length;

  const storeLinked = warehouses.filter((warehouse) => mappingByWarehouse.has(warehouse.id)).length;
  const shippingRulesReady = warehouses.filter(
    (warehouse) => warehouse.insideDhakaFee !== null && warehouse.outsideDhakaFee !== null,
  ).length;

  const warehouseBlockers = warehouses
    .map((warehouse) => {
      const blockers: string[] = [];
      const mapping = mappingByWarehouse.get(warehouse.id);

      if (!mapping) {
        blockers.push('No courier pickup point registered');
      } else {
        if (!isMappedLocation(mapping) || !mapping.cityId || !mapping.zoneId || !mapping.areaId) {
          blockers.push('Pickup point location is not mapped to courier ids');
        }
        if (!mapping.isActive || mapping.status !== 'active') {
          blockers.push(
            mapping.status === 'pending'
              ? 'Pickup point awaiting courier approval'
              : `Pickup point is ${mapping.status}`,
          );
        }
        if (mapping.lastError) blockers.push(`Last pickup point error: ${mapping.lastError}`);
      }

      if (warehouse.insideDhakaFee === null || warehouse.outsideDhakaFee === null) {
        blockers.push('Shipping rules missing');
      }

      return { id: warehouse.id, name: warehouse.name, provider: mapping?.provider ?? null, blockers };
    })
    .filter((warehouse) => warehouse.blockers.length > 0)
    .slice(0, 12);

  const bookingCandidates = activeShipments.slice(0, 12).map((shipment) => {
    const blockers: string[] = [];
    const mapping = shipment.warehouseId ? mappingByWarehouse.get(shipment.warehouseId) : null;

    if (!shipment.warehouse) blockers.push('Warehouse missing');
    if (shipment.warehouse && !mapping) blockers.push('Pickup point not registered');
    if (shipment.warehouse && mapping && !mapping.isActive) {
      blockers.push('Pickup point not usable yet');
    }
    if (!shipment.courierProvider) blockers.push('No courier assigned');
    if (!shipment.trackingId) blockers.push('Tracking ID pending');
    if (shipment.bookingState === 'uncertain') blockers.push('Booking outcome unknown');

    return {
      id: shipment.id,
      orderId: shipment.order.orderCode || shipment.orderId,
      warehouseName: shipment.warehouse?.name ?? null,
      provider: shipment.courierProvider,
      trackingId: shipment.trackingId,
      status: shipment.status,
      blockers,
    };
  });

  const syncAttention = activeShipments.filter(
    (shipment) => !shipment.trackingId || shipment.bookingState === 'uncertain',
  );

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    liveProbe,

    providers: providerViews.map((view) => {
      const report = healthReports.find((entry) => entry.provider === view.code) ?? null;
      return {
        code: view.code,
        name: view.name,
        mode: view.mode,
        capabilities: view.capabilities,
        setupStatus: view.setupStatus,
        setupMessage: view.setupMessage,
        missingConfig: view.missingConfig,
        linkedStoreCount: mappings.filter((mapping) => mapping.provider === view.code).length,
        activeShipmentCount: activeShipments.filter(
          (shipment) => shipment.courierProvider === view.code,
        ).length,
        // Null unless `?probe=1` asked for a live check, so the UI can tell
        // "not checked" apart from "checked and healthy".
        health: report ?? null,
      };
    }),

    /**
     * Config shape, token state and connectivity, per provider. Never values.
     *
     * Empty without `?probe=1`, which is the honest answer: connectivity is
     * unknown until someone asks the courier.
     */
    providerHealth: healthReports.map((report) => ({
      provider: report.provider,
      healthy: report.healthy,
      missingConfig: report.missingConfig,
      hasCachedToken: report.tokenState.hasCachedToken,
      tokenExpiresAt: report.tokenState.expiresAt,
      refreshAvailable: report.tokenState.refreshAvailable,
      webhookConfigured: report.webhookConfigured,
      latencyMs: report.latencyMs,
      message: report.message,
      checkedAt: report.checkedAt,
    })),

    readiness: {
      // Aggregated rather than per-provider env var names: naming a specific
      // env var in a dashboard is fine, but a second courier's keys cannot be
      // enumerated without provider-specific code, which is what this route just
      // removed. `missingConfig` above already lists the exact keys.
      anyProviderConfigured: providerViews.some((view) => view.setupStatus === 'api_ready'),
      warehouseBlockers,
      bookingCandidates,
    },

    warehouseSummary: {
      total: warehouses.length,
      locationMapped,
      storeLinked,
      shippingRulesReady,
      needsAttention: warehouseBlockers.length,
    },

    shipmentSummary: {
      active: activeShipments.length,
      exceptions: exceptionShipments.length,
      // Shipments that cannot currently be polled, i.e. a reconciliation backlog.
      syncAttention: syncAttention.length,
      bookingBacklog: backlog,
    },

    warehouseHealth: warehouses.slice(0, 50).map((warehouse) => {
      const mapping = mappingByWarehouse.get(warehouse.id);
      return {
        id: warehouse.id,
        name: warehouse.name,
        city: warehouse.city,
        provider: providerCode(warehouse.id),
        externalStoreId: mapping?.externalStoreId ?? null,
        externalStoreName: mapping?.externalStoreName ?? null,
        storeStatus: mapping?.status ?? null,
        locationMapped: isMappedLocation(mapping),
        storeLinked: Boolean(mapping),
        shippingRulesReady:
          warehouse.insideDhakaFee !== null && warehouse.outsideDhakaFee !== null,
        insideDhakaFee: numberValue(warehouse.insideDhakaFee),
        outsideDhakaFee: numberValue(warehouse.outsideDhakaFee),
        insideDhakaEta: warehouse.insideDhakaEta,
        outsideDhakaEta: warehouse.outsideDhakaEta,
      };
    }),

    recentExceptions: exceptionShipments.map((shipment) => ({
      id: shipment.id,
      orderId: shipment.order.orderCode || shipment.orderId,
      customerName: shipment.order.user?.name ?? null,
      warehouseName: shipment.warehouse?.name ?? null,
      warehouseCity: shipment.warehouse?.city ?? null,
      status: shipment.status,
      provider: shipment.courierProvider,
      trackingId: shipment.trackingId,
      deliveryFailureReason: shipment.deliveryFailureReason,
      updatedAt: shipment.updatedAt.toISOString(),
    })),

    syncWatchlist: syncAttention.map((shipment) => ({
      id: shipment.id,
      orderId: shipment.order.orderCode || shipment.orderId,
      customerName: shipment.order.user?.name ?? null,
      warehouseName: shipment.warehouse?.name ?? null,
      provider: shipment.courierProvider,
      status: shipment.status,
      trackingId: shipment.trackingId,
      bookingState: shipment.bookingState,
      providerStatus: shipment.providerStatus,
      lastReconciledAt: shipment.lastReconciledAt?.toISOString() ?? null,
      syncAgeHours: hoursSince(shipment.updatedAt),
    })),
  });
}
