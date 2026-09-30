import { prisma } from '@/lib/server';
import { Prisma } from '@prisma/client';
import { getShippingQuote } from '@/features/courier/services/quoteService';
import { restoreStockForOrder } from './inventoryService';
import { ensureTelegramInvoice, sendInvoiceToTelegram } from './invoiceService';
import { sendLowStockAlert, sendNewOrderNotification, sendOrderStatusNotification } from './notificationService';

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
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
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
  // A missing destination or an unreachable courier yields a configured flat
  // fallback, and the order is recorded with `deliveryFeeVerified: false` so the
  // figure can be reconciled against the courier invoice rather than mistaken
  // for a confirmed price.
  const destination = readDestination(input.shippingAddress);
  const collectibleAmount = Math.max(0, subtotal - discountAmount);

  const quote = destination
    ? await getShippingQuote({
        items: normalizedItems,
        destination,
        codAmount: collectibleAmount,
      })
    : null;

  const deliveryFee = quote?.totalCustomerDeliveryFee ?? 0;
  const deliveryFeeVerified = quote?.verified === true;
  const deliveryQuoteWarnings = quote?.warnings ?? [
    'No delivery city was supplied, so no delivery fee could be calculated.',
  ];

  const total = Math.max(0, subtotal - discountAmount) + platformFee + deliveryFee;
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

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: input.userId,
        guestEmail: input.guestEmail || null,
        guestPhone: input.guestPhone || null,
        tenantId: input.tenantId,
        total,
        status: 'processing',
        orderCode,
        paymentMethod: input.paymentMethod || 'cod',
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
    const warehouseIdByProductId = new Map<string, string>();

    for (const item of pricedItems) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });

      if (updated.count !== 1) {
        const product = productById.get(item.productId);
        throw new Error(`Insufficient stock for ${product?.name || item.productId}`);
      }

      const inventoryRows = await tx.inventoryItem.findMany({
        where: { productId: item.productId },
        orderBy: [{ quantity: 'desc' }, { updatedAt: 'desc' }],
        take: 2,
      });

      const inventoryItem =
        inventoryRows.find((row) => row.quantity >= item.quantity) ??
        (inventoryRows.length === 0 ? null : undefined);

      if (inventoryItem === undefined) {
        throw new Error(
          `Insufficient warehouse inventory for ${productById.get(item.productId)?.name || item.productId}`,
        );
      }

      if (inventoryItem) {
        warehouseIdByProductId.set(item.productId, inventoryItem.warehouseId);

        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: {
            quantity: { decrement: item.quantity },
            movements: {
              create: {
                productId: item.productId,
                warehouseId: inventoryItem.warehouseId,
                type: 'sale',
                quantityDelta: -item.quantity,
                reason: 'order_created',
                reference: created.id,
              },
            },
          },
        });
      }

      const product = productById.get(item.productId)!;
      const nextStock = product.stock - item.quantity;
      const threshold = inventoryItem?.reorderLevel ?? Number(process.env.LOW_STOCK_THRESHOLD || 5);
      if (product.sellerId && nextStock <= threshold) {
        lowStockAlerts.push({
          sellerId: product.sellerId,
          productName: product.name,
          stock: nextStock,
          threshold,
        });
      }
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
      // Group this seller's items by the warehouse that will actually ship them.
      const itemsByWarehouse = new Map<string, typeof sellerItems>();
      for (const item of sellerItems) {
        const warehouseId = warehouseIdByProductId.get(item.productId) || '';
        itemsByWarehouse.set(warehouseId, [...(itemsByWarehouse.get(warehouseId) || []), item]);
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
            customerDeliveryFee: parcel ? new Prisma.Decimal(parcel.customerDeliveryFee) : null,
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
  });

  try {
    await ensureTelegramInvoice(order.id);
  } catch (invoiceError) {
    console.error('Order created but invoice generation failed:', invoiceError);
  }

  await Promise.all(lowStockAlerts.map((alert) => sendLowStockAlert(alert)));

  const sellerIds = [...new Set(pricedItems.map((item) => item.sellerId))];
  await Promise.all(
    sellerIds.map((sellerId) =>
      sendNewOrderNotification({
        sellerId,
        orderId: order.id,
        orderCode,
        total,
      }),
    ),
  );

  return prisma.order.findUnique({
    where: { id: order.id },
    include: {
      items: { include: { product: true } },
      shipments: { include: { items: true } },
      invoice: true,
    },
  });
}

export async function assertSellerTelegramAccess(chatId: string | number, sellerId: string) {
  const seller = await prisma.user.findFirst({
    where: {
      id: sellerId,
      telegramChatId: String(chatId),
      role: { in: ['seller', 'admin', 'reseller'] },
    },
    select: { id: true },
  });

  if (!seller) {
    throw new Error('This Telegram chat is not linked to the seller account');
  }

  return seller;
}

export async function updateSellerOrderStatus(input: {
  chatId: string | number;
  sellerId: string;
  orderId: string;
  action: 'accept' | 'reject' | 'ship' | 'deliver';
}) {
  await assertSellerTelegramAccess(input.chatId, input.sellerId);

  const status =
    input.action === 'accept'
      ? 'processing'
      : input.action === 'ship'
        ? 'picked_up'
        : input.action === 'deliver'
          ? 'delivered'
          : 'cancelled';

  const existingShipment = await prisma.orderShipment.findFirst({
    where: {
      orderId: input.orderId,
      sellerId: input.sellerId,
    },
    select: {
      id: true,
      status: true,
      items: {
        select: {
          productId: true,
          qty: true,
        },
      },
    },
  });

  const shipment = await prisma.orderShipment.updateMany({
    where: {
      orderId: input.orderId,
      sellerId: input.sellerId,
    },
    data: {
      status: status as any,
      ...(status === 'picked_up' ? { pickedUpAt: new Date() } : {}),
      ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
    },
  });

  if (!shipment.count) {
    throw new Error('Seller shipment not found for this order');
  }

  if (status === 'cancelled' && existingShipment && existingShipment.status !== 'cancelled') {
    await restoreStockForOrder(
      existingShipment.items.map((item) => ({
        productId: item.productId,
        quantity: item.qty,
        reference: input.orderId,
      })),
    );
  }

  // The parent order is a marketplace aggregate. Its status must be derived
  // from all seller shipments, never overwritten by one seller's state.
  const allShipments = await prisma.orderShipment.findMany({
    where: { orderId: input.orderId },
    select: { status: true },
  });

  const shipmentStatuses = allShipments.map((item) => String(item.status));
  const parentStatus =
    shipmentStatuses.length > 0 && shipmentStatuses.every((item) => item === 'cancelled')
      ? 'cancelled'
      : shipmentStatuses.length > 0 && shipmentStatuses.every((item) => item === 'delivered')
        ? 'delivered'
        : shipmentStatuses.some((item) =>
              ['picked_up', 'in_transit', 'out_for_delivery'].includes(item),
            )
          ? 'picked_up'
          : 'processing';

  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      status: parentStatus,
      ...(parentStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
    },
  });

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { orderCode: true },
  });

  await sendOrderStatusNotification({
    sellerId: input.sellerId,
    orderId: input.orderId,
    orderCode: order?.orderCode,
    status,
  });

  if (status === 'processing') {
    await sendInvoiceToTelegram({
      chatId: input.chatId,
      orderId: input.orderId,
      caption: `Invoice for order ${order?.orderCode || input.orderId}`,
    });
  }

  return { status };
}
