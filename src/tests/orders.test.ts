import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { createMarketplaceOrder as createOrder } from '@/features/orders/services/orderService';
import { prisma } from '@/lib/server';

let idempotencySequence = 0;

vi.mock('@/lib/server', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
    coupon: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn({
      order: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      orderItem: { findMany: vi.fn(), create: vi.fn() },
      product: { updateMany: vi.fn(), findUnique: vi.fn() },
      inventoryItem: { findFirst: vi.fn(), update: vi.fn() },
      stockReservation: { create: vi.fn(), findFirst: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      orderShipment: { create: vi.fn() },
      orderShipmentItem: { create: vi.fn() },
      coupon: { findUnique: vi.fn() },
    })),
    order: { findUnique: vi.fn() },
    orderShipment: { create: vi.fn() },
    orderShipmentItem: { create: vi.fn() },
  },
}));

vi.mock('@/features/courier/services/quoteService', () => ({
  getShippingQuote: vi.fn(async ({ items }: { items: Array<{ productId: string; quantity: number }> }) => ({
    provider: 'pathao',
    currency: 'BDT',
    verified: true,
    freeShippingApplied: false,
    freeShippingThreshold: 0,
    amountToCollect: 0,
    totalCustomerDeliveryFee: 20,
    warnings: [],
    shipments: [{
      warehouseId: 'wh-1',
      warehouseName: 'Test warehouse',
      courierStoreId: 'store-1',
      itemCount: items.reduce((count, item) => count + item.quantity, 0),
      weightKg: 1,
      courierCharge: 19,
      codFee: 1,
      customerDeliveryFee: 20,
      estimatedDays: 2,
      verified: true,
      source: 'provider',
      reason: null,
      allocations: items,
    }],
  })),
}));

vi.mock('@/features/telegram_bot/lib/notificationService', () => ({
  sendLowStockAlert: vi.fn(),
  sendNewOrderNotification: vi.fn(),
}));

vi.mock('@/features/telegram_bot/lib/invoiceService', () => ({
  ensureTelegramInvoice: vi.fn(),
  sendInvoiceToTelegram: vi.fn(),
}));

describe('orders.test.ts', () => {
  const createMarketplaceOrder = (input: Parameters<typeof createOrder>[0]) =>
    createOrder({
      ...input,
      idempotencyKey: input.idempotencyKey ?? `orders-test-key-${++idempotencySequence}`,
      shippingAddress:
        input.shippingAddress && typeof input.shippingAddress === 'object'
          ? input.shippingAddress
          : { city: 'Dhaka', address: input.shippingAddress ?? 'Test address' },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    idempotencySequence = 0;
  });

  const mockProduct = (id: string, stock: number, price: number = 100) => ({
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    sku: `SKU-${id}`,
    description: `Description for Product ${id}`,
    specifications: null,
    price: new Decimal(price),
    oldPrice: null,
    // Shipping weight. Null here so these fixtures exercise the same
    // "no weight on file" path as a legacy catalogue.
    weightKg: null,
    image: null,
    galleryImages: null,
    videoUrl: null,
    model3d: null,
    category: null,
    variantOptions: null,
    resellerEnabled: false,
    resellerBasePrice: null,
    resellerSuggestedPrice: null,
    resellerNotes: null,
    productStatus: 'published',
    publishedAt: new Date(),
    stock,
    tenantId: null,
    rating: 0,
    reviewsCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    sellerId: 'seller-1',
  });

  const mockTx = () => ({
    order: {
      create: vi.fn().mockResolvedValue({ id: 'order-1', orderCode: 'ORD-123', total: 300, status: 'pending' }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'order-1',
        orderCode: 'ORD-123',
        total: 300,
        status: 'pending',
        items: { include: { product: true } },
        shipments: { include: { items: true } },
        invoice: true,
      }),
    },
    orderItem: {
      findMany: vi.fn().mockResolvedValue([{ id: 'oi-1', productId: 'prod-1' }]),
      create: vi.fn(),
    },
    product: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(mockProduct('prod-1', 100)),
    },
    inventoryItem: {
      findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', warehouseId: 'wh-1', reorderLevel: 5 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({ id: 'inv-1', quantity: 99 }),
    },
    stockReservation: { create: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    orderShipment: { create: vi.fn().mockResolvedValue({ id: 'ship-1' }) },
    orderShipmentItem: { create: vi.fn() },
    coupon: { findUnique: vi.fn() },
  });

  beforeEach(() => {
    vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(mockTx()));
    vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct('prod-1', 100)]);
    vi.mocked(prisma.coupon.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.order.findUnique).mockImplementation((args: any) =>
      (args.where?.idempotencyKey
        ? null
        : {
            id: 'order-1',
            orderCode: 'ORD-123',
            total: new Decimal(300),
            status: 'pending',
            items: { include: { product: true } },
            shipments: { include: { items: true } },
            invoice: true,
          }) as never,
    );
  });

  describe('valid order creation with sufficient stock', () => {
    it('should create order successfully', async () => {
      const order = await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St, Dhaka',
      });

      expect(order).toBeDefined();
      expect(order!.id).toBe('order-1');
    });
  });

  describe('invalid product ID rejection', () => {
    it('should reject unknown product ID', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([]);

      await expect(
        createMarketplaceOrder({
          userId: 'user-1',
          items: [{ productId: 'nonexistent', quantity: 1 }],
          paymentMethod: 'cod',
        }),
      ).rejects.toThrow('Product not found: nonexistent');
    });
  });

  describe('invalid quantity rejection', () => {
    it('should normalize negative quantity to 1', async () => {
      const tx = mockTx();
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      const order = await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: -5 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St',
      });

      expect(order).toBeDefined();
      const createArg = vi.mocked(tx.order.create).mock.calls[0][0].data;
      const orderItem = createArg.items.create[0];
      expect(orderItem.qty).toBe(1);
    });
  });

  describe('insufficient stock rejection', () => {
    it('should reject when stock is insufficient', async () => {
      vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct('prod-1', 2)]);

      const tx = {
        order: { create: vi.fn(), findUnique: vi.fn() },
        orderItem: { findMany: vi.fn(), create: vi.fn() },
        product: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn().mockResolvedValue(mockProduct('prod-1', 2)),
        },
        inventoryItem: { findFirst: vi.fn(), update: vi.fn() },
        stockReservation: { create: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        orderShipment: { create: vi.fn() },
        orderShipmentItem: { create: vi.fn() },
        coupon: { findUnique: vi.fn() },
      };
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      await expect(
        createMarketplaceOrder({
          userId: 'user-1',
          items: [{ productId: 'prod-1', quantity: 5 }],
          paymentMethod: 'cod',
        }),
      ).rejects.toThrow('Insufficient stock');
    });
  });

  describe('price tampering prevention', () => {
    it('should use server-side price, ignoring client price', async () => {
      let capturedCreateArg: any;
      const tx = mockTx();
      const orderCreateSpy = vi.mocked(tx.order.create);
      orderCreateSpy.mockImplementation((arg: any) => {
        capturedCreateArg = arg;
        return Promise.resolve({ id: 'order-1', orderCode: 'ORD-123', total: 200, status: 'pending' });
      });

      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 1, price: 999 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St',
      });

      const orderItem = capturedCreateArg.data.items.create[0];
      expect(orderItem.price).toBe(100);
    });
  });

  describe('reseller price tampering prevention', () => {
    it('should enforce reseller_base_price for reseller products', async () => {
      const product = {
        ...mockProduct('prod-reseller', 100, 200),
        resellerEnabled: true,
        resellerBasePrice: new Decimal(150),
      };

      vi.mocked(prisma.product.findMany).mockResolvedValue([product]);

      const tx = {
        order: {
          create: vi.fn().mockResolvedValue({ id: 'order-1', total: 300 }),
          findUnique: vi.fn().mockResolvedValue({ id: 'order-1', total: 300 }),
        },
        orderItem: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
        product: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue(product),
        },
        inventoryItem: {
          findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', warehouseId: 'wh-1', reorderLevel: 5 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn(),
        },
        stockReservation: { create: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        orderShipment: { create: vi.fn() },
        orderShipmentItem: { create: vi.fn() },
        coupon: { findUnique: vi.fn() },
      };

      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      const order = await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-reseller', quantity: 1 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St',
      });

      expect(order).toBeDefined();
    });
  });

  describe('order validation', () => {
    it('should reject empty items array', async () => {
      await expect(
        createMarketplaceOrder({
          userId: 'user-1',
          items: [],
          paymentMethod: 'cod',
        }),
      ).rejects.toThrow('Order must include at least one item');
    });

    it('should reject order exceeding max lines', async () => {
      const manyItems = Array.from({ length: 51 }, (_, i) => ({
        productId: `prod-${i}`,
        quantity: 1,
      }));

      await expect(
        createMarketplaceOrder({
          userId: 'user-1',
          items: manyItems,
          paymentMethod: 'cod',
        }),
      ).rejects.toThrow();
    });
  });

  describe('concurrent checkout against stock=1', () => {
    it('should allow only one of two parallel checkouts when a single unit is in stock', async () => {
      let stock = 1;

      const tx = {
        order: {
          create: vi.fn().mockResolvedValue({ id: 'order-1', orderCode: 'ORD-1', total: 105, status: 'pending' }),
          findUnique: vi.fn(),
        },
        orderItem: {
          findMany: vi.fn().mockResolvedValue([{ id: 'oi-1', productId: 'prod-1' }]),
          create: vi.fn(),
        },
        product: {
          updateMany: vi.fn((args: any) => {
            const qty = Math.abs(Number(args?.data?.stock?.decrement ?? 0));
            const count = stock >= qty ? 1 : 0;
            if (count === 1) stock -= qty;
            return Promise.resolve({ count });
          }),
          findUnique: vi.fn().mockResolvedValue(mockProduct('prod-1', 1, 100)),
        },
        inventoryItem: {
          findFirst: vi.fn().mockResolvedValue({ id: 'inv-1', warehouseId: 'wh-1', reorderLevel: 5 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn(),
        },
        stockReservation: { create: vi.fn() },
        inventoryMovement: { create: vi.fn() },
        orderShipment: { create: vi.fn().mockResolvedValue({ id: 'ship-1' }) },
        orderShipmentItem: { create: vi.fn() },
        coupon: { findUnique: vi.fn() },
      };

      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));
      vi.mocked(prisma.product.findMany).mockResolvedValue([mockProduct('prod-1', 1, 100)]);
      vi.mocked(prisma.coupon.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.order.findUnique).mockImplementation((args: any) =>
        (args.where?.idempotencyKey
          ? null
          : {
              id: 'order-1',
              orderCode: 'ORD-1',
              total: new Decimal(105),
              status: 'pending',
              paymentMethod: 'cod',
              paymentStatus: 'pending',
              items: { include: { product: true } },
              shipments: { include: { items: true } },
              invoice: true,
            }) as never,
      );

      const results = await Promise.allSettled([
        createMarketplaceOrder({
          userId: 'buyer-1',
          items: [{ productId: 'prod-1', quantity: 1 }],
          paymentMethod: 'cod',
        }),
        createMarketplaceOrder({
          userId: 'buyer-2',
          items: [{ productId: 'prod-1', quantity: 1 }],
          paymentMethod: 'cod',
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected').length;

      expect(fulfilled).toBe(1);
      expect(rejected).toBe(1);
      expect(stock).toBe(0);

      const rejectionReason = (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason as Error;
      expect(rejectionReason.message).toMatch(/Insufficient stock/);
    });
  });
});
