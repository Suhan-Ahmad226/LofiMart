import { prisma } from '@/lib/server';
import { reduceStockForOrder, restoreStockForOrder } from './inventoryService';
import { ensureTelegramInvoice, sendInvoiceToTelegram } from './invoiceService';
import { sendNewOrderNotification, sendOrderStatusNotification } from './notificationService';

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
};

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

  const normalizedItems = input.items.map((item) => ({
    productId: String(item.productId || ''),
    quantity: Math.max(1, Number(item.quantity || 1)),
    price: Number(item.price || 0),
  }));

  const products = await prisma.product.findMany({
    where: { id: { in: normalizedItems.map((item) => item.productId) } },
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
    const price = item.price > 0 ? item.price : Number(product.price);
    return {
      ...item,
      sellerId: product.sellerId!,
      price,
      lineTotal: price * item.quantity,
    };
  });

  const total = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const orderCode = buildOrderCode();

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
        const orderItem = createdItems.find((candidate) => candidate.productId === item.productId);
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

  await reduceStockForOrder(
    pricedItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      reference: order.id,
    })),
  );

  await ensureTelegramInvoice(order.id);

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
  const seller = await (prisma.user as any).findFirst({
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
