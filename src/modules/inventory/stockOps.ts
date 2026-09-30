// ============================================================================
// INVENTORY SOURCE-OF-TRUTH & ATOMIC STOCK OPERATIONS
// ----------------------------------------------------------------------------
// Authority model (see PHASE 1 §1.2):
//   Warehouse
//     └── InventoryItem.quantity   <-- AUTHORITATIVE on-hand stock (per product+warehouse)
//           ├── InventoryItem.reserved  (reserved-but-not-yet-consumed units)
//           ├── StockReservation        (auditable reservation rows with expiresAt)
//           └── InventoryMovement       (auditable ledger of every delta)
//   Product.stock                  <-- DERIVED DISPLAY CACHE = SUM(quantity) across warehouses
//
// RULES:
//   * All mutating inventory paths MUST go through these helpers (or replicate their
//     atomic updateMany-with-guard pattern). Never "read then decrement" outside a
//     guarded transaction.
//   * Do not allow negative stock: every decrement is guarded with `quantity >= qty`
//     and commits only when the guard matches.
//   * Product.stock is only ever recomputed from InventoryItem.quantity (never mutated
//     as a primary source).
// ============================================================================

import { Prisma } from '@prisma/client';

type ProductUpdateInput = Prisma.ProductUpdateArgs;
type ProductUpdateManyInput = Prisma.ProductUpdateManyArgs;

type InventoryItemFindFirstInput = Prisma.InventoryItemFindFirstArgs;
type InventoryItemUpdateInput = Prisma.InventoryItemUpdateArgs;
type InventoryItemUpdateManyInput = Prisma.InventoryItemUpdateManyArgs;
type InventoryItemAggregateInput = Prisma.InventoryItemAggregateArgs;

type StockReservationCreateInput = Prisma.StockReservationCreateArgs;
type StockReservationUpdateInput = Prisma.StockReservationUpdateArgs;
type StockReservationFindFirstInput = Prisma.StockReservationFindFirstArgs;
type StockReservationFindManyInput = Prisma.StockReservationFindManyArgs;
type StockReservationUpdateManyInput = Prisma.StockReservationUpdateManyArgs;

type InventoryMovementCreateInput = Prisma.InventoryMovementCreateArgs;

export type StockOperationClient = {
  product: {
    update: (args: ProductUpdateInput) => Promise<Prisma.ProductGetPayload<ProductUpdateInput>>;
    updateMany: (args: ProductUpdateManyInput) => Promise<{ count: number }>;
  };
  inventoryItem: {
    findFirst: (args: InventoryItemFindFirstInput) => Promise<Prisma.InventoryItemGetPayload<InventoryItemFindFirstInput> | null>;
    update: (args: InventoryItemUpdateInput) => Promise<Prisma.InventoryItemGetPayload<InventoryItemUpdateInput>>;
    updateMany: (args: InventoryItemUpdateManyInput) => Promise<{ count: number }>;
    aggregate: (args: InventoryItemAggregateInput) => Promise<{
      _count?: unknown;
      _sum?: { quantity?: number | null } | null;
      _avg?: unknown;
      _min?: unknown;
      _max?: unknown;
    }>;
  };
  stockReservation: {
    create: (args: StockReservationCreateInput) => Promise<Prisma.StockReservationGetPayload<StockReservationCreateInput>>;
    update: (args: StockReservationUpdateInput) => Promise<Prisma.StockReservationGetPayload<StockReservationUpdateInput>>;
    findFirst: (args: StockReservationFindFirstInput) => Promise<Prisma.StockReservationGetPayload<StockReservationFindFirstInput> | null>;
    findMany: (args: StockReservationFindManyInput) => Promise<Prisma.StockReservationGetPayload<StockReservationFindManyInput>[]>;
    updateMany: (args: StockReservationUpdateManyInput) => Promise<{ count: number }>;
  };
  inventoryMovement: {
    create: (args: InventoryMovementCreateInput) => Promise<Prisma.InventoryMovementGetPayload<InventoryMovementCreateInput>>;
  };
};

const LOW_STOCK_THRESHOLD_DEFAULT = 5;

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/** Sum of authoritative on-hand quantity across all warehouses for a product. */
export async function getAvailableStock(tx: StockOperationClient, productId: string): Promise<number> {
  const agg = await tx.inventoryItem.aggregate({
    where: { productId },
    _sum: { quantity: true },
  });
  return Number(agg._sum?.quantity ?? 0);
}

/**
 * Pick the warehouse from which to fulfil a line, preferring the one with the
 * most available on-hand quantity. Returns the inventory item id + warehouseId,
 * or null when nothing is available.
 */
export async function pickFulfilmentInventory(
  tx: StockOperationClient,
  productId: string,
): Promise<{ inventoryItemId: string; warehouseId: string } | null> {
  const item = await tx.inventoryItem.findFirst({
    where: {
      productId,
      quantity: { gt: 0 },
    },
    orderBy: { quantity: 'desc' },
    select: { id: true, warehouseId: true, quantity: true },
  });
  if (!item || Number(item.quantity) <= 0) {
    return null;
  }
  return { inventoryItemId: item.id, warehouseId: item.warehouseId };
}

// ---------------------------------------------------------------------------
// Mutating helpers (all atomic)
// ---------------------------------------------------------------------------

type MovementReason =
  | 'order_consume'
  | 'order_release'
  | 'reservation_consume'
  | 'reservation_expire'
  | 'manual_adjustment';

async function recordMovement(
  tx: StockOperationClient,
  args: {
    inventoryItemId: string;
    productId: string;
    warehouseId: string;
    quantityDelta: number;
    reason: MovementReason | string;
    reference?: string | null;
  },
) {
  await tx.inventoryMovement.create({
    data: {
      inventoryItemId: args.inventoryItemId,
      productId: args.productId,
      warehouseId: args.warehouseId,
      type: args.quantityDelta >= 0 ? 'add' : 'remove',
      quantityDelta: args.quantityDelta,
      reason: args.reason,
      reference: args.reference ?? null,
    },
  });
}

/**
 * Recompute the Product.stock display cache from the authoritative InventoryItem rows.
 * Must be called inside the same transaction after any quantity change.
 */
export async function resetProductStockCache(tx: StockOperationClient, productId: string): Promise<number> {
  const available = await getAvailableStock(tx, productId);
  await tx.product.update({
    where: { id: productId },
    data: { stock: available },
  });
  return available;
}

export interface ReserveStockInput {
  productId: string;
  quantity: number;
  reference: string;
  /** Preferred warehouse; when omitted, the highest-availability warehouse is used. */
  warehouseId?: string | null;
  inventoryItemId?: string | null;
  orderId?: string | null;
  reservationMinutes?: number;
  threshold?: number;
}

export interface ReserveStockResult {
  ok: boolean;
  reason?: 'insufficient_stock' | 'not_available';
  productId: string;
  quantity: number;
  /** id of the StockReservation row (only set when ok) */
  reservationId?: string;
  inventoryItemId?: string;
  warehouseId?: string;
  availableAfter?: number;
  lowStock: boolean;
}

/**
 * Atomically reserve stock for a checkout / manual order.
 *
 * Implementation is ATOMIC: we `updateMany` guarding `quantity >= qty` and only
 * commit on `count === 1`, eliminating the read-then-decrement TOCTOU race. When
 * the guard fails (concurrent checkout grabbed the last unit), we return
 * `{ ok: false }` and the caller rolls back.
 */
export async function reserveStock(
  tx: StockOperationClient,
  input: ReserveStockInput,
): Promise<ReserveStockResult> {
  const { productId, quantity, reference } = input;
  const qty = Math.max(1, Math.floor(Number(quantity) || 0));

  let inventoryItemId = input.inventoryItemId ?? null;
  let warehouseId = input.warehouseId ?? null;

  if (!inventoryItemId || !warehouseId) {
    const pick = await pickFulfilmentInventory(tx, productId);
    if (!pick) {
      return {
        ok: false,
        reason: 'not_available',
        productId,
        quantity: qty,
        lowStock: true,
      };
    }
    inventoryItemId = pick.inventoryItemId;
    warehouseId = pick.warehouseId;
  }

  const isReserved = await tx.inventoryItem.updateMany({
    where: {
      id: inventoryItemId,
      productId,
      quantity: { gte: qty },
    },
    data: {
      quantity: { decrement: qty },
      reserved: { increment: qty },
    },
  });

  if (isReserved.count !== 1) {
    return {
      ok: false,
      reason: 'insufficient_stock',
      productId,
      quantity: qty,
      lowStock: true,
    };
  }

  const expiresAt = new Date(Date.now() + (input.reservationMinutes ?? 120) * 60 * 1000);
  const reservation = await tx.stockReservation.create({
    data: {
      productId,
      warehouseId,
      inventoryItemId,
      orderId: input.orderId ?? null,
      quantity: qty,
      status: 'reserved',
      expiresAt,
    },
  });

  await recordMovement(tx, {
    inventoryItemId,
    productId,
    warehouseId,
    quantityDelta: -qty,
    reason: input.orderId ? 'reservation_consume' : 'order_consume',
    reference,
  });

  const availableAfter = await resetProductStockCache(tx, productId);
  const remaining = await tx.inventoryItem.findFirst({
    where: { id: inventoryItemId },
    select: { quantity: true },
  });
  const lowStock = Number(remaining?.quantity ?? 0) <= (input.threshold ?? LOW_STOCK_THRESHOLD_DEFAULT);

  return {
    ok: true,
    productId,
    quantity: qty,
    reservationId: reservation.id,
    inventoryItemId,
    warehouseId,
    availableAfter,
    lowStock,
  };
}

/**
 * Release a reservation back to available stock (expiry, cancel, or abandoned
 * checkout). Idempotent: safe to call multiple times.
 */
export async function releaseReservation(
  tx: StockOperationClient,
  reservationId: string,
  reason: 'cancel' | 'expire' = 'cancel',
): Promise<void> {
  const reservation = await tx.stockReservation.findFirst({
    where: { id: reservationId, status: 'reserved' },
    select: { id: true, productId: true, warehouseId: true, inventoryItemId: true, quantity: true },
  });
  if (!reservation) {
    return;
  }

  await tx.inventoryItem.update({
    where: { id: reservation.inventoryItemId },
    data: {
      quantity: { increment: reservation.quantity },
      reserved: { decrement: reservation.quantity },
    },
  });

  await tx.stockReservation.update({
    where: { id: reservationId },
    data: { status: reason === 'expire' ? 'expired' : 'released' },
  });

  await recordMovement(tx, {
    inventoryItemId: reservation.inventoryItemId,
    productId: reservation.productId,
    warehouseId: reservation.warehouseId,
    quantityDelta: reservation.quantity,
    reason: reason === 'expire' ? 'reservation_expire' : 'order_release',
    reference: reservationId,
  });

  await resetProductStockCache(tx, reservation.productId);
}

/**
 * Consume a reservation permanently (order confirmed / shipped). Moves the units
 * out of `reserved` without restoring them to `quantity`. Idempotent.
 */
export async function consumeReservation(
  tx: StockOperationClient,
  reservationId: string,
): Promise<void> {
  const reservation = await tx.stockReservation.findFirst({
    where: { id: reservationId, status: 'reserved' },
    select: { id: true, productId: true, warehouseId: true, inventoryItemId: true, quantity: true },
  });
  if (!reservation) {
    return;
  }
  await tx.inventoryItem.update({
    where: { id: reservation.inventoryItemId },
    data: { reserved: { decrement: reservation.quantity } },
  });
  await tx.stockReservation.update({
    where: { id: reservationId },
    data: { status: 'consumed' },
  });
  await resetProductStockCache(tx, reservation.productId);
}

/**
 * Release every reservation that has not yet been consumed and whose expiresAt
 * has passed, returning stock to available. Idempotent; safe to run on a schedule.
 */
export async function releaseExpiredReservations(tx: StockOperationClient): Promise<number> {
  const expired = await tx.stockReservation.findMany({
    where: {
      status: 'reserved',
      expiresAt: { lt: new Date() },
    },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      inventoryItemId: true,
      quantity: true,
    },
  });

  let released = 0;
  for (const reservation of expired) {
    await tx.inventoryItem.update({
      where: { id: reservation.inventoryItemId },
      data: {
        quantity: { increment: reservation.quantity },
        reserved: { decrement: reservation.quantity },
      },
    });
    await tx.stockReservation.update({
      where: { id: reservation.id },
      data: { status: 'expired' },
    });
    await recordMovement(tx, {
      inventoryItemId: reservation.inventoryItemId,
      productId: reservation.productId,
      warehouseId: reservation.warehouseId,
      quantityDelta: reservation.quantity,
      reason: 'reservation_expire',
      reference: reservation.id,
    });
    await resetProductStockCache(tx, reservation.productId);
    released += 1;
  }

  return released;
}

/**
 * Restore stock into a specific warehouse's inventory item (or the most
 * recently updated item as a fallback) and record a movement. Used by legacy
 * order-restore paths that track stock at the warehouse level rather than via
 * StockReservation rows.
 */
export async function orderRestoreInventoryFallback(
  tx: StockOperationClient,
  args: {
    productId: string;
    quantity: number;
    warehouseId?: string | null;
    reference?: string;
  },
): Promise<void> {
  const quantity = Math.max(0, Math.floor(Number(args.quantity) || 0));
  if (quantity <= 0) return;

  let item: { id: string; warehouseId: string | null } | null = null;
  if (args.warehouseId) {
    item = await tx.inventoryItem.findFirst({
      where: { productId: args.productId, warehouseId: args.warehouseId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, warehouseId: true },
    });
  }
  if (!item) {
    item = await tx.inventoryItem.findFirst({
      where: { productId: args.productId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, warehouseId: true },
    });
  }

  if (item) {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: { increment: quantity } },
    });
    if (item.warehouseId) {
      await recordMovement(tx, {
        inventoryItemId: item.id,
        productId: args.productId,
        warehouseId: item.warehouseId,
        quantityDelta: quantity,
        reason: 'order_release',
        reference: args.reference,
      });
    }
  }
}

/**
 * Restore stock back to the authoritative inventory items for an order's
 * fulfilled lines. Used when an order is cancelled/rejected after its
 * reservations were consumed or are still reserved.
 *
 * Looks up the order's StockReservation rows (consumed or reserved) to
 * determine exactly which inventory items fulfilled each line, restoring
 * `quantity` and clearing `reserved` accordingly and recording a movement.
 * When the order has no reservation rows (e.g. old/manual orders), falls back
 * to restoring into whichever inventory item currently holds stock.
 *
 * Idempotent and safe to call only from within an open transaction.
 */
export async function restoreOrderStock(
  tx: StockOperationClient,
  args: {
    orderId: string;
    lines: Array<{ productId: string; quantity: number }>;
    reference?: string;
  },
): Promise<void> {
  const reservations = await tx.stockReservation.findMany({
    where: { orderId: args.orderId, status: { in: ['consumed', 'reserved'] } },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      inventoryItemId: true,
      quantity: true,
      status: true,
    },
  });

  const reservationByProduct = new Map<string, typeof reservations[number]>();
  for (const reservation of reservations) {
    if (!reservationByProduct.has(reservation.productId)) {
      reservationByProduct.set(reservation.productId, reservation);
    }
  }

  for (const line of args.lines) {
    const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
    if (quantity <= 0) continue;

    const reservation = reservationByProduct.get(line.productId);
    if (reservation && reservation.inventoryItemId) {
      await tx.inventoryItem.update({
        where: { id: reservation.inventoryItemId },
        data: {
          quantity: { increment: quantity },
          reserved: { decrement: reservation.status === 'reserved' ? quantity : 0 },
        },
      });
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data: { status: 'released' },
      });
      await recordMovement(tx, {
        inventoryItemId: reservation.inventoryItemId,
        productId: line.productId,
        warehouseId: reservation.warehouseId,
        quantityDelta: quantity,
        reason: 'order_release',
        reference: args.reference ?? args.orderId,
      });
    } else {
      // Fallback: restore into the most recently updated inventory item.
      await orderRestoreInventoryFallback(tx, {
        productId: line.productId,
        quantity,
        reference: args.reference ?? args.orderId,
      });
    }

    await resetProductStockCache(tx, line.productId);
  }
}