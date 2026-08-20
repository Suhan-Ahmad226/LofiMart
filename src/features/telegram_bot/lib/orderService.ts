import { prisma } from '@/lib/server';
import { restoreStockForOrder } from './inventoryService';
import { ensureTelegramInvoice, sendInvoiceToTelegram } from './invoiceService';
import { sendLowStockAlert, sendNewOrderNotification, sendOrderStatusNotification } from './notificationService';

type CreateOrderLine = {
  productId: string;
  quantity: number;
  price?: number;
};

type CreateMarketplaceOrderInput = {
  userId: string;
  tenantId?: string;
  items: CreateOrderLine[];
  paymentMethod?: string;
  shippingAddress?: unknown;
  refCode?: string;
  couponCode?: string;
  deliveryFee?: number;
  platformFee?: number;
};

const DEFAULT_PLATFORM_FEE = 5;
const MAX_DELIVERY_FEE = 10000;

function buildOrderCode() {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeStatusForOrder(status: 'accepted' | 'shipped' | 'delivered' | 'cancelled') {
  if (status === 'accepted') return 'accepted';
  if (status === 'shipped') return 'shipped';
  if (status === 'delivered') return 'delivered';
  return 'cancelled';
}

export async function createMarketplaceOrder(input: CreateMarketplaceOrderInput) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Order must include at least one item');
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
  const deliveryFee = Math.min(Math.max(0, Number(input.deliveryFee || 0)), MAX_DELIVERY_FEE);
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

  const total = Math.max(0, subtotal - discountAmount) + platformFee + deliveryFee;
  const orderCode = buildOrderCode();
  const lowStockAlerts: Array<{ sellerId: string; productName: string; stock: number; threshold: number }> = [];

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        total,
        status: 'pending',
        orderCode,
        paymentMethod: input.paymentMethod || 'cod',
        paymentStatus: input.paymentMethod === 'bkash' ? 'pending' : 'unpaid',
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

    for (const item of pricedItems) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });

      if (updated.count !== 1) {
        const product = productById.get(item.productId);
        throw new Error(`Insufficient stock for ${product?.name || item.productId}`);
      }

      const inventoryItem = await tx.inventoryItem.findFirst({
        where: { productId: item.productId },
        orderBy: { updatedAt: 'desc' },
      });

      if (inventoryItem) {
        await tx.inventoryItem.update({
          where: { id: inventoryItem.id },
          data: {
            quantity: Math.max(0, inventoryItem.quantity - item.quantity),
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

    for (const [sellerId, sellerItems] of itemsBySeller.entries()) {
      const shipment = await tx.orderShipment.create({
        data: {
          orderId: created.id,
          sellerId,
          status: 'pending',
          total: sellerItems.reduce((sum, item) => sum + item.lineTotal, 0),
          itemCount: sellerItems.reduce((sum, item) => sum + item.quantity, 0),
        },
      });

      for (const item of sellerItems) {
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

    return created;
  });

  await ensureTelegramInvoice(order.id);

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
      ? 'accepted'
      : input.action === 'ship'
        ? 'shipped'
        : input.action === 'deliver'
          ? 'delivered'
          : 'cancelled';

  const orderStatus = normalizeStatusForOrder(status);
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
      status,
      ...(status === 'shipped' ? { pickedUpAt: new Date() } : {}),
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

  await prisma.order.update({
    where: { id: input.orderId },
    data: {
      status: orderStatus,
      ...(status === 'shipped' ? { pickedUpAt: new Date() } : {}),
      ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
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

  if (status === 'accepted') {
    await sendInvoiceToTelegram({
      chatId: input.chatId,
      orderId: input.orderId,
      caption: `Invoice for order ${order?.orderCode || input.orderId}`,
    });
  }

  return { status };
}
