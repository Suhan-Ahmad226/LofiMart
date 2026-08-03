import { NextResponse } from 'next/server';
import { prisma } from '../../../../../features/shared/services/database/prisma';
import { courierProviderRegistry } from '../../../../../features/courier/services/providerRegistry';
import { requireRole, requireUser } from '../../../../../server/next/requireUser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const exceptionStatuses = ['failed', 'cancelled', 'returned', 'return_requested', 'delivery_failed'];
const activeStatuses = ['processing', 'pickup_requested', 'picked_up', 'out_for_delivery', 'shipped'];

function numberValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function envReady(key: string) {
  return Boolean(String(process.env[key] || '').trim());
}

function providerName(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || 'Unassigned';
}

function syncAgeHours(value?: Date | string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 36_000) / 100);
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(user, ['admin']);
  if (roleError) return roleError;

  const [providers, warehouses, activeShipments, exceptionShipments] = await Promise.all([
    Promise.resolve(courierProviderRegistry.listProviders()),
    prisma.warehouse.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
    prisma.orderShipment.findMany({
      where: { status: { in: activeStatuses } },
      include: {
        order: { include: { user: true } },
        warehouse: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    }),
    prisma.orderShipment.findMany({
      where: {
        OR: [
          { status: { in: exceptionStatuses } },
          { deliveryFailureReason: { not: null } },
        ],
      },
      include: {
        order: { include: { user: true } },
        warehouse: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
  ]);

  const areaMapped = warehouses.filter((warehouse) => warehouse.pathaoCityId && warehouse.pathaoZoneId && warehouse.pathaoAreaId).length;
  const storeLinked = warehouses.filter((warehouse) => warehouse.pathaoStoreId).length;
  const shippingRulesReady = warehouses.filter((warehouse) => warehouse.insideDhakaFee !== null && warehouse.outsideDhakaFee !== null).length;

  const pathaoShipments = activeShipments.filter((shipment) => providerName(shipment.courierProvider).toLowerCase().includes('pathao'));
  const redxShipments = activeShipments.filter((shipment) => providerName(shipment.courierProvider).toLowerCase().includes('redx'));
  const steadfastShipments = activeShipments.filter((shipment) => providerName(shipment.courierProvider).toLowerCase().includes('steadfast'));

  const warehouseBlockers = warehouses
    .map((warehouse) => {
      const blockers: string[] = [];
      if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) blockers.push('Pathao area mapping missing');
      if (!warehouse.pathaoStoreId) blockers.push('Pathao store link missing');
      if (warehouse.insideDhakaFee === null || warehouse.outsideDhakaFee === null) blockers.push('Shipping rules missing');
      return { id: warehouse.id, name: warehouse.name, blockers };
    })
    .filter((warehouse) => warehouse.blockers.length > 0)
    .slice(0, 12);

  const bookingCandidates = pathaoShipments.slice(0, 12).map((shipment) => {
    const blockers: string[] = [];
    if (!shipment.warehouse) blockers.push('Warehouse missing');
    if (shipment.warehouse && (!shipment.warehouse.pathaoCityId || !shipment.warehouse.pathaoZoneId || !shipment.warehouse.pathaoAreaId)) {
      blockers.push('Warehouse Pathao mapping missing');
    }
    if (shipment.warehouse && !shipment.warehouse.pathaoStoreId) blockers.push('Warehouse Pathao store missing');
    if (!shipment.trackingId) blockers.push('Tracking ID pending');

    return {
      id: shipment.id,
      order_id: shipment.order.orderCode || shipment.orderId,
      warehouse_name: shipment.warehouse?.name || null,
      courier_provider: shipment.courierProvider,
      tracking_id: shipment.trackingId,
      status: shipment.status,
      blockers,
    };
  });

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    providers: providers.map((provider) => ({
      code: provider.code,
      name: provider.name,
      mode: provider.mode,
      setupStatus: provider.setupStatus,
      setupMessage: provider.setupMessage,
      supportsTrackingSync: provider.supportsTrackingSync,
    })),
    steadfastHealth: {
      apiConfigured: envReady('STEADFAST_API_KEY') && envReady('STEADFAST_SECRET_KEY'),
      webhookConfigured: envReady('STEADFAST_WEBHOOK_TOKEN'),
      baseUrl: process.env.STEADFAST_BASE_URL || null,
    },
    pathaoHealth: {
      baseUrl: process.env.PATHAO_BASE_URL || null,
      hasCachedToken: false,
      tokenType: null,
      issuedAt: null,
      expiresAt: null,
      expiresInSeconds: null,
      refreshTokenAvailable: false,
      linkedStoreCount: storeLinked,
      webhookConfigured: envReady('PATHAO_WEBHOOK_TOKEN'),
    },
    pathaoReadiness: {
      envChecks: [
        { key: 'PATHAO_BASE_URL', label: 'Base URL', ready: envReady('PATHAO_BASE_URL') },
        { key: 'PATHAO_CLIENT_ID', label: 'Client ID', ready: envReady('PATHAO_CLIENT_ID') },
        { key: 'PATHAO_CLIENT_SECRET', label: 'Client secret', ready: envReady('PATHAO_CLIENT_SECRET') },
        { key: 'PATHAO_USERNAME', label: 'Merchant username', ready: envReady('PATHAO_USERNAME') },
        { key: 'PATHAO_PASSWORD', label: 'Merchant password', ready: envReady('PATHAO_PASSWORD') },
        { key: 'PATHAO_WEBHOOK_TOKEN', label: 'Webhook token', ready: envReady('PATHAO_WEBHOOK_TOKEN') },
      ],
      envReady: envReady('PATHAO_BASE_URL') && envReady('PATHAO_CLIENT_ID') && envReady('PATHAO_CLIENT_SECRET') && envReady('PATHAO_USERNAME') && envReady('PATHAO_PASSWORD'),
      warehouseBlockers,
      bookingCandidates,
    },
    warehouseSummary: {
      total: warehouses.length,
      areaMapped,
      storeLinked,
      shippingRulesReady,
      needsAttention: warehouseBlockers.length,
    },
    shipmentSummary: {
      active: activeShipments.length,
      exceptions: exceptionShipments.length,
      pathaoSyncAttention: pathaoShipments.length,
      redxSyncAttention: redxShipments.length,
      steadfastSyncAttention: steadfastShipments.length,
    },
    warehouseHealth: warehouses.slice(0, 50).map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      city: warehouse.city,
      pathao_store_id: warehouse.pathaoStoreId,
      mapping_ready: Boolean(warehouse.pathaoCityId && warehouse.pathaoZoneId && warehouse.pathaoAreaId),
      store_linked: Boolean(warehouse.pathaoStoreId),
      shipping_rules_ready: warehouse.insideDhakaFee !== null && warehouse.outsideDhakaFee !== null,
      inside_dhaka_fee: numberValue(warehouse.insideDhakaFee),
      outside_dhaka_fee: numberValue(warehouse.outsideDhakaFee),
      inside_dhaka_eta: warehouse.insideDhakaEta,
      outside_dhaka_eta: warehouse.outsideDhakaEta,
    })),
    recentExceptions: exceptionShipments.map((shipment) => ({
      id: shipment.id,
      order_id: shipment.order.orderCode || shipment.orderId,
      customer_name: shipment.order.user.name,
      warehouse_name: shipment.warehouse?.name || null,
      warehouse_city: shipment.warehouse?.city || null,
      status: shipment.status,
      courier_provider: shipment.courierProvider,
      tracking_id: shipment.trackingId,
      delivery_failure_reason: shipment.deliveryFailureReason,
      updated_at: shipment.updatedAt.toISOString(),
    })),
    pathaoWatchlist: pathaoShipments.map((shipment) => ({
      id: shipment.id,
      order_id: shipment.order.orderCode || shipment.orderId,
      customer_name: shipment.order.user.name,
      warehouse_name: shipment.warehouse?.name || null,
      status: shipment.status,
      tracking_id: shipment.trackingId,
      booking_reference: null,
      pathao_last_event: null,
      pathao_last_status_slug: null,
      pathao_last_sync_at: shipment.updatedAt.toISOString(),
      sync_age_hours: syncAgeHours(shipment.updatedAt),
    })),
    redxWatchlist: redxShipments.map((shipment) => ({
      id: shipment.id,
      order_id: shipment.order.orderCode || shipment.orderId,
      customer_name: shipment.order.user.name,
      warehouse_name: shipment.warehouse?.name || null,
      status: shipment.status,
      tracking_id: shipment.trackingId,
      booking_reference: null,
      redx_last_sync_at: shipment.updatedAt.toISOString(),
      sync_age_hours: syncAgeHours(shipment.updatedAt),
    })),
  });
}
