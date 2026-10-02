import type { OrderStatus, ShipmentStatus } from '@prisma/client';
import { prismaDirect } from '@/features/shared/services/database/prisma';

const PROGRESS_RANK: Record<string, number> = {
  processing: 1,
  packed: 2,
  ready_for_pickup: 3,
  pickup_requested: 4,
  picked_up: 5,
  in_transit: 6,
  out_for_delivery: 7,
  delivered: 8,
};

const TERMINAL_EXCEPTIONS = new Set(['delivery_failed', 'returned', 'cancelled']);

export function deriveOrderStatus(statuses: ShipmentStatus[]): OrderStatus {
  if (statuses.length === 0) return 'processing';
  if (statuses.every((status) => status === 'cancelled')) return 'cancelled';
  if (statuses.every((status) => status === 'delivered')) return 'delivered';

  // If all parcels are finished but at least one failed/returned, keep the
  // aggregate honest instead of reporting the whole marketplace order as
  // delivered.
  if (statuses.every((status) => TERMINAL_EXCEPTIONS.has(status) || status === 'delivered')) {
    if (statuses.some((status) => status === 'returned')) return 'returned';
    if (statuses.some((status) => status === 'delivery_failed')) return 'delivery_failed';
    if (statuses.some((status) => status === 'cancelled')) return 'cancelled';
  }

  let best: ShipmentStatus = 'processing';
  let bestRank = PROGRESS_RANK.processing;
  for (const status of statuses.filter((status) => status !== 'delivered')) {
    const rank = PROGRESS_RANK[status] ?? 0;
    if (rank > bestRank) {
      best = status;
      bestRank = rank;
    }
  }

  return best === 'pending' ? 'processing' : (best as OrderStatus);
}

/**
 * Recomputes the marketplace Order status exclusively from its shipments.
 * Shipment-level services call this after every real transition so a single
 * seller/courier update can never overwrite the aggregate with stale state.
 */
export async function syncOrderStatusFromShipments(orderId: string) {
  const shipments = await prismaDirect.orderShipment.findMany({
    where: { orderId },
    select: { status: true },
  });

  const status = deriveOrderStatus(shipments.map((shipment) => shipment.status));
  const existingOrder = await prismaDirect.order.findUnique({
    where: { id: orderId },
    select: { pickedUpAt: true, deliveredAt: true },
  });

  const data: {
    status: OrderStatus;
    pickedUpAt?: Date;
    deliveredAt?: Date;
  } = { status };

  if (
    (status === 'picked_up' ||
      status === 'in_transit' ||
      status === 'out_for_delivery' ||
      status === 'delivered') &&
    !existingOrder?.pickedUpAt
  ) {
    data.pickedUpAt = new Date();
  }
  if (status === 'delivered' && !existingOrder?.deliveredAt) {
    data.deliveredAt = new Date();
  }

  await prismaDirect.order.update({
    where: { id: orderId },
    data,
  });

  return status;
}
