import { prisma } from '@/lib/server';
import { Prisma } from '@prisma/client';
import { getShippingQuote } from '@/features/courier/services/quoteService';
import { runOrderPostCreateEffects } from './postCreateEffects';
import { isKnownCheckoutPaymentMethod } from '@/lib/commerce-channels';
import { randomBytes } from 'node:crypto';

type CreateOrderLine = {
  productId: string;
  quantity: number;
  price?: number;
};

type CreateMarketplaceOrderInput = {
  userId?: string;
  guestEmail?: string;
  guestPhone?: string;
  tenantId?: string;
  items: CreateOrderLine[];
  paymentMethod?: string;
  shippingAddress?: unknown;
  refCode?: string;
  couponCode?: string;
  platformFee?: number;
  idempotencyKey?: string;
};

const DEFAULT_PLATFORM_FEE = 5;

/**
 * Pulls the delivery destination out of the collected shipping address.
 *
 * The bot stores the address as an opaque JSON blob, so the shape varies by
 * conversation. Returns `null` unless a city is actually present: a fabricated
 * city would produce a wrong courier price, and a missing one simply means the
 * order is recorded with an unverified fee for the seller to resolve.
 */
function readDestination(shippingAddress: unknown): { city: string; zone: string | null; area: string | null } | null {
  if (!shippingAddress || typeof shippingAddress !== 'object') return null;

  const address = shippingAddress as Record<string, unknown>;
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = address[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };

  const city = pick('city', 'district', 'cityName', 'city_name', 'shippingCity');

  if (!city) return null;

  return { city, zone: pick('zone', 'area', 'thana', 'upazila'), area: pick('area', 'areaName', 'area_name') };
}

function buildOrderCode() {
  return `ORD-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function normalizeStatusForOrder(status: 'accepted' | 'shipped' | 'delivered' | 'cancelled') {
  if (status === 'accepted') return 'processing';
  if (status === 'shipped') return 'picked_up';
  if (status === 'delivered') return 'delivered';
  return 'cancelled';
}

export async function createMarketplaceOrder(input: CreateMarketplaceOrderInput) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Order must include at least one item');
  }

  if (!input.userId && (!input.guestEmail || !input.guestPhone)) {
    throw new Error('Guest orders require both a guest email and phone number');
  }

  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) throw new Error('A valid idempotency key is required');
  const existingByKey = await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existingByKey) {
    // An idempotency key is scoped to the exact buyer identity. Never let a
    // logged-in buyer replay a guest order's key (or vice versa), and never
    // treat missing identity fields as a successful match.
    const sameBuyer = existingByKey.userId
      ? input.userId === existingByKey.userId
      : !input.userId &&
        Boolean(input.guestEmail?.trim()) &&
        Boolean(input.guestPhone?.trim()) &&
        existingByKey.guestEmail?.trim().toLowerCase() === input.guestEmail!.trim().toLowerCase() &&
        existingByKey.guestPhone?.trim() === input.guestPhone!.trim();
    const sameTenant = (existingByKey.tenantId ?? null) === (input.tenantId ?? null);

    if (!sameBuyer || !sameTenant) {
      throw new Error('Invalid idempotency key');
    }

    return prisma.order.findUnique({
      where: { id: existingByKey.id },
      include: {
        items: { include: { product: true } },
        shipments: { include: { items: true } },
        invoice: true,
      },
    });
  }

  const normalizedItems = Array.from(
    input.items.reduce((acc, item) => {
      const productId = String(item.productId || '').trim();
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
      if (!productId || !Number.isFinite(quantity)) return acc;
      acc.set(productId, (acc.get(productId) || 0) + quantity);
      return acc;
    }, new Map<string, number>()),
    ([productId, quantity]) => ({ productId, quantity }),
  );

  if (normalizedItems.length === 0) {
    throw new Error('Order must include at least one valid item');
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: normalizedItems.map((item) => item.productId) },
      productStatus: 'published',
      OR: [
        { seller: { role: 'admin' } },
        { seller: { role: 'seller', sellerStatus: 'approved', storefrontPublished: true } },
      ],
    },
    select: { id: true, name: true, price: true, stock: true, sellerId: true },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  for (const item of normalizedItems) {
    const product = productById.get(item.productId);
    if (!product) throw new Error(`Product not found: ${item.productId}`);
    if (!product.sellerId) throw new Error(`Product has no seller mapping: ${product.name}`);
    if (product.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
  }

  const pricedItems = normalizedItems.map((item) => {
    const product = productById.get(item.productId)!;
    const price = Number(product.price);
    return {
      ...item,
      sellerId: product.sellerId!,
      price,
      lineTotal: price * item.quantity,
    };
  });

  const subtotal = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const platformFee = DEFAULT_PLATFORM_FEE;
  let discountAmount = 0;
  let couponSnapshot: Record<string, unknown> | null = null;

  const paymentMethod = String(input.paymentMethod || 'cod').trim().toLowerCase();
  if (!isKnownCheckoutPaymentMethod(paymentMethod)) {
    throw new Error('Unsupported payment method');
  }

  const couponCode = String(input.couponCode || '').trim();
  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode },
      select: {
        code: true,
        sellerId: true,
        discountType: true,
        discountValue: true,
        minOrderValue: true,
        expiryDate: true,
      },
    });

    if (!coupon) throw new Error('Coupon not found');
    if (coupon.expiryDate < new Date()) throw new Error('Coupon has expired');

    const eligibleSubtotal = coupon.sellerId
      ? pricedItems
          .filter((item) => item.sellerId === coupon.sellerId)
          .reduce((sum, item) => sum + item.lineTotal, 0)
      : subtotal;
    const minOrderValue = Number(coupon.minOrderValue ?? 0);
    if (eligibleSubtotal < minOrderValue) {
      throw new Error(`Minimum order value is ${minOrderValue}`);
    }

    const discountType = String(coupon.discountType || '').toLowerCase() === 'percentage' ? 'percentage' : 'flat';
    const discountValue = Math.max(0, Number(coupon.discountValue ?? 0));
    const rawDiscount = discountType === 'percentage' ? (eligibleSubtotal * discountValue) / 100 : discountValue;
    discountAmount = Math.min(eligibleSubtotal, Math.max(0, rawDiscount));
    couponSnapshot = {
      code: coupon.code,
      sellerId: coupon.sellerId,
      discountType,
      discountValue,
      discountAmount,
    };
  }

  // Delivery fee is calculated on the server from database prices, product
  // weights and the courier's own quote. It was previously hardcoded to 0, which
  // meant the platform silently absorbed every courier charge and the
  // collectible amount never covered delivery.
  //
  // Placed after the coupon block because the collectible amount depends on the
  // discount: the courier charges a COD fee on what the rider actually collects.
  //
  // Production checkout requires a real destination and a verified live courier
  // quote. A fallback fee must never silently become a customer order total.
  const destination = readDestination(input.shippingAddress);

  if (!destination) {
    throw new Error('A delivery city is required before the order can be placed.');
  }

  // Financial rule: the customer pays merchandise after discount + platform fee
  // + delivery fee. COD is the full customer payable amount, because the rider
  // collects the amount shown at checkout. Pathao's COD fee depends on the COD
  // amount, while the delivery fee includes that COD fee, so resolve the small
  // circular dependency with a bounded fixed-point pass.
  const merchandisePayable = Math.max(0, subtotal - discountAmount);
  let codAmount = merchandisePayable + platformFee;
  let quote = await getShippingQuote({
    items: normalizedItems,
    destination,
    codAmount,
  });

  for (let pass = 0; pass < 2; pass += 1) {
    if (!quote.verified) break;
    const nextCodAmount = merchandisePayable + platformFee + quote.totalCustomerDeliveryFee;
    if (Math.abs(nextCodAmount - codAmount) < 0.01) break;
    codAmount = nextCodAmount;
    quote = await getShippingQuote({
      items: normalizedItems,
      destination,
      codAmount,
    });
  }

  if (!quote.verified) {
    throw new Error(
      quote.warnings[0] ||
        'Live Pathao shipping price could not be verified. Please try again.',
    );
  }

  const deliveryFee = quote.totalCustomerDeliveryFee;
  const deliveryFeeVerified = true;
  const deliveryQuoteWarnings = quote.warnings;
  const total = merchandisePayable + platformFee + deliveryFee;
  const collectibleAmount = total;
  const orderCode = buildOrderCode();
  const lowStockAlerts: Array<{ sellerId: string; productName: string; stock: number; threshold: number }> = [];

  /**
   * What the rider should collect for one parcel.
   *
   * Apportioned by value share, because the courier charges its COD fee on the
   * collectible amount and that fee is per parcel. The platform fee is excluded
   * because the platform does not collect it on delivery.
   *
   * Proportional rather than exact per-item allocation: a seller-scoped coupon is
   * apportioned across all parcels by value, which can differ by a few taka from a
   * per-seller allocation. Recorded as a real number rather than zero so a
   * settlement run can reconcile the difference against the courier invoice.
   */
  const collectibleAmountFor = (parcelItems: Array<{ lineTotal: number }>): number => {
    const parcelTotal = parcelItems.reduce((sum, item) => sum + item.lineTotal, 0);
    if (subtotal <= 0) return 0;
    return collectibleAmount * (parcelTotal / subtotal);
  };

  const loadExistingOrder = async (orderId: string) =>
    prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, shipments: { include: { items: true } }, invoice: true },
    });

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: input.userId,
        guestEmail: input.guestEmail || null,
        guestPhone: input.guestPhone || null,
        tenantId: input.tenantId,
        idempotencyKey,
        total,
        status: 'processing',
        orderCode,
        paymentMethod,
        paymentStatus: 'pending',
        shippingAddress: input.shippingAddress || undefined,
        shipmentMetadata: {
          pricing: {
            subtotal,
            discountAmount,
            coupon: couponSnapshot,
            platformFee,
            deliveryFee,
            total,
            source: 'server',
            // Whether `deliveryFee` came from a live courier quote or a
            // configured fallback. Persisted so finance can reconcile a
            // fallback charge against the courier invoice.
            deliveryFeeVerified,
            deliveryQuoteWarnings,
            courierProvider: quote?.provider ?? null,
            collectibleAmount,
          },
        },
        refCode: input.refCode || undefined,
        items: {
          create: pricedItems.map((item) => ({
            productId: item.productId,
            qty: item.quantity,
            price: item.price,
          })),
        },
      },
    });

    const createdItems = await tx.orderItem.findMany({
      where: { orderId: created.id },
      select: { id: true, productId: true },
    });
    const createdItemByProductId = new Map(createdItems.map((item) => [item.productId, item]));

    /**
     * Which warehouse each product actually ships from.
     *
     * Captured here because this is the only place the `InventoryItem` row is read.
     * Without it the shipment has no `warehouseId`, which leaves the courier booking
     * with no pickup point to collect from and pushes every parcel into a manual
     * flow.
     */
    const allocationsByProductId = new Map<string, Array<{ warehouseId: string; quantity: number }>>();
    const quoteWarehouseIds = new Set((quote.shipments || []).map((parcel) => parcel.warehouseId));

    for (const item of pricedItems) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });

      if (updated.count !== 1) {
        const product = productById.get(item.productId);
        throw new Error(`Insufficient stock for ${product?.name || item.productId}`);
      }

      const quotedAllocations = (quote.shipments || []).flatMap((parcel) =>
        (parcel.allocations || [])
          .filter((allocation) => allocation.productId === item.productId)
          .map((allocation) => ({
            warehouseId: parcel.warehouseId,
            quantity: allocation.quantity,
          })),
      );
      const quotedQuantity = quotedAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      if (quotedQuantity !== item.quantity) {
        throw new Error(
          'Shipping quote is missing the exact warehouse allocation for this item. Please refresh checkout.',
        );
      }

      const actualAllocations: Array<{ warehouseId: string; quantity: number }> = [];

      for (const allocation of quotedAllocations) {
        const inventoryItem = await tx.inventoryItem.findFirst({
          where: {
            productId: item.productId,
            warehouseId: allocation.warehouseId,
            quantity: { gte: allocation.quantity },
          },
          orderBy: [{ quantity: 'desc' }, { updatedAt: 'desc' }, { warehouseId: 'asc' }],
        });

        if (!inventoryItem) {
          throw new Error(
            `Insufficient warehouse inventory for ${productById.get(item.productId)?.name || item.productId}`,
          );
        }

        const inventoryUpdated = await tx.inventoryItem.updateMany({
          where: {
            id: inventoryItem.id,
            quantity: { gte: allocation.quantity },
          },
          data: {
            quantity: { decrement: allocation.quantity },
          },
        });

        if (inventoryUpdated.count !== 1) {
          throw new Error(
            `Inventory changed while placing the order for ${productById.get(item.productId)?.name || item.productId}. Please try again.`,
          );
        }

        actualAllocations.push({
          warehouseId: inventoryItem.warehouseId,
          quantity: allocation.quantity,
        });

        await tx.inventoryMovement.create({
          data: {
            inventoryItemId: inventoryItem.id,
            productId: item.productId,
            warehouseId: inventoryItem.warehouseId,
            type: 'sale',
            quantityDelta: -allocation.quantity,
            reason: 'order_created',
            reference: created.id,
          },
        });
      }

      allocationsByProductId.set(item.productId, actualAllocations);

      const product = productById.get(item.productId)!;
      const nextStock = product.stock - item.quantity;
      const threshold = Number(process.env.LOW_STOCK_THRESHOLD || 5);
      if (product.sellerId && nextStock <= threshold) {
        lowStockAlerts.push({
          sellerId: product.sellerId,
          productName: product.name,
          stock: nextStock,
          threshold,
        });
      }
    }

    // The quote and the order must use the exact same warehouse + quantity
    // allocation. If stock changed between quote and placement, abort instead of
    // silently charging the customer for one pickup plan and booking another.
    const normalizeAllocations = (allocations: Array<{ warehouseId: string; quantity: number }>) =>
      allocations
        .filter((allocation) => allocation.quantity > 0)
        .sort((a, b) => a.warehouseId.localeCompare(b.warehouseId))
        .map((allocation) => `${allocation.warehouseId}:${allocation.quantity}`)
        .join('|');

    const quoteAllocationByProductId = new Map<string, Array<{ warehouseId: string; quantity: number }>>();
    for (const parcel of quote.shipments || []) {
      for (const allocation of parcel.allocations || []) {
        const list = quoteAllocationByProductId.get(allocation.productId) || [];
        const existing = list.find((entry) => entry.warehouseId === parcel.warehouseId);
        if (existing) existing.quantity += allocation.quantity;
        else list.push({ warehouseId: parcel.warehouseId, quantity: allocation.quantity });
        quoteAllocationByProductId.set(allocation.productId, list);
      }
    }

    const exactAllocationMatches = pricedItems.every(
      (item) =>
        normalizeAllocations(quoteAllocationByProductId.get(item.productId) || []) ===
        normalizeAllocations(allocationsByProductId.get(item.productId) || []),
    );
    const allocatedWarehouseIds = new Set(
      [...allocationsByProductId.values()].flatMap((allocations) =>
        allocations.map((allocation) => allocation.warehouseId),
      ),
    );
    if (
      !exactAllocationMatches ||
      quoteWarehouseIds.size !== allocatedWarehouseIds.size ||
      [...quoteWarehouseIds].some((warehouseId) => !allocatedWarehouseIds.has(warehouseId))
    ) {
      throw new Error(
        'Stock changed while preparing your shipment. Please refresh the checkout and request a new delivery quote.',
      );
    }

    const itemsBySeller = new Map<string, typeof pricedItems>();
    for (const item of pricedItems) {
      itemsBySeller.set(item.sellerId, [...(itemsBySeller.get(item.sellerId) || []), item]);
    }

    // The quote splits parcels by warehouse, not by seller. A seller with stock in
    // two warehouses therefore gets one shipment per warehouse, keyed here so the
    // financial columns below can be attributed to the right parcel instead of
    // being lumped into one row.
    const quoteByWarehouse = new Map((quote?.shipments || []).map((parcel) => [parcel.warehouseId, parcel]));

    for (const [sellerId, sellerItems] of itemsBySeller.entries()) {
      // Split each seller line across every warehouse allocation frozen by the quote.
      const itemsByWarehouse = new Map<string, Array<(typeof sellerItems)[number]>>();
      for (const item of sellerItems) {
        const allocations = allocationsByProductId.get(item.productId) || [];
        for (const allocation of allocations) {
          const warehouseItem = {
            ...item,
            quantity: allocation.quantity,
            lineTotal: item.price * allocation.quantity,
          };
          itemsByWarehouse.set(allocation.warehouseId, [
            ...(itemsByWarehouse.get(allocation.warehouseId) || []),
            warehouseItem,
          ]);
        }
      }

      for (const [warehouseId, warehouseItems] of itemsByWarehouse.entries()) {
        const parcel = warehouseId ? quoteByWarehouse.get(warehouseId) : undefined;

        const shipment = await tx.orderShipment.create({
          data: {
            orderId: created.id,
            sellerId,
            warehouseId: warehouseId || null,
            status: 'processing',
            total: warehouseItems.reduce((sum, item) => sum + item.lineTotal, 0),
            itemCount: warehouseItems.reduce((sum, item) => sum + item.quantity, 0),
            /**
             * Frozen now, at checkout, from the server-side quote.
             *
             * The customer-facing fee, the courier's actual cost and the COD fee
             * are separate columns on purpose: conflating them is how a platform
             * ends up paying delivery out of margin while believing it was
             * profitable. Null (not zero) when no live quote existed, so "we do not
             * know" is distinguishable from "delivery was free".
             */
            courierProvider: quote?.provider ?? null,
            customerDeliveryFee: parcel
              ? new Prisma.Decimal(quote.freeShippingApplied ? 0 : parcel.customerDeliveryFee)
              : null,
            courierCharge: parcel?.courierCharge != null ? new Prisma.Decimal(parcel.courierCharge) : null,
            codFee: new Prisma.Decimal(parcel?.codFee ?? 0),
            codAmount: new Prisma.Decimal(Math.max(0, collectibleAmountFor(warehouseItems))),
            // Per-parcel verification: one unquoted parcel must not mark the whole
            // order as courier-confirmed.
            deliveryFeeVerified: Boolean(parcel?.verified),
            /**
             * `merchantReference` is deliberately NOT set here.
             *
             * It is derived from the shipment id by the booking service, which
             * reuses an existing value if one is present. Minting one at order time
             * would either duplicate that logic or, worse, create a second key that
             * disagrees with the one retries use — which is precisely how one
             * physical parcel ends up with two courier-side references.
             */
            shipmentMetadata: {
              quoteSource: parcel?.source ?? 'none',
              quoteReason: parcel?.reason ?? null,
              weightKg: parcel?.weightKg ?? null,
              estimatedDays: parcel?.estimatedDays ?? null,
              courierStoreId: parcel?.courierStoreId ?? null,
              deliveryFeeWarnings: deliveryQuoteWarnings,
            },
          },
        });

        for (const item of warehouseItems) {
          const orderItem = createdItemByProductId.get(item.productId);
          if (!orderItem) continue;
          await tx.orderShipmentItem.create({
            data: {
              shipmentId: shipment.id,
              orderItemId: orderItem.id,
              productId: item.productId,
              qty: item.quantity,
              price: item.price,
            },
          });
        }
      }
    }

    return created;
  }).catch(async (error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const replay = await prisma.order.findUnique({
        where: { idempotencyKey },
        select: { id: true, userId: true },
      });
      if (replay && (!replay.userId || replay.userId === input.userId)) {
        return loadExistingOrder(replay.id);
      }
    }
    throw error;
  });

  if (!order) {
    throw new Error('Order could not be created.');
  }

  const sellerIds = [...new Set(pricedItems.map((item) => item.sellerId))];
  await runOrderPostCreateEffects({
    orderId: order.id,
    orderCode,
    total,
    sellerIds,
    lowStockAlerts,
  });

  return prisma.order.findUnique({
    where: { id: order.id },
    include: {
      items: { include: { product: true } },
      shipments: { include: { items: true } },
      invoice: true,
    },
  });
}

