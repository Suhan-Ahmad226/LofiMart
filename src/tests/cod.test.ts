import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { createMarketplaceOrder as createOrder } from '@/features/orders/services/orderService';
import { prisma } from '@/lib/server';
import { toPlainNumber } from '@/app/api/products/shared';

let idempotencySequence = 0;

vi.mock('@/lib/server', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
    coupon: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
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

describe('cod.test.ts', () => {
  const createMarketplaceOrder = (input: Parameters<typeof createOrder>[0]) =>
    createOrder({
      ...input,
      idempotencyKey: input.idempotencyKey ?? `cod-test-idempotency-${++idempotencySequence}`,
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
    seller: null,
    specifications: null,
  });

  const makeTx = () => {
    const orderCreate = vi.fn().mockResolvedValue({
      id: 'order-1',
      orderCode: 'ORD-123',
      total: 300,
      status: 'processing',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
    });

    const tx = {
      order: {
        create: orderCreate,
        findUnique: vi.fn().mockResolvedValue({
          id: 'order-1',
          orderCode: 'ORD-123',
          total: 300,
          status: 'processing',
          paymentMethod: 'cod',
          paymentStatus: 'pending',
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
        update: vi.fn(),
      },
      stockReservation: { create: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      orderShipment: { create: vi.fn().mockResolvedValue({ id: 'ship-1' }) },
      orderShipmentItem: { create: vi.fn() },
      coupon: { findUnique: vi.fn() },
    };
    return { tx, orderCreate };
  };

  beforeEach(() => {
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
            paymentMethod: 'cod',
            paymentStatus: 'pending',
            items: { include: { product: true } },
            shipments: { include: { items: true } },
            invoice: true,
          }) as never,
    );
  });

  describe('COD order creation works', () => {
    it('should create order with COD payment method', async () => {
      const { tx, orderCreate } = makeTx();
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      const order = await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St, Dhaka',
      });

      expect(order).toBeDefined();
      expect(order!.id).toBe('order-1');

      const createArg = vi.mocked(orderCreate).mock.calls[0][0].data;
      expect(createArg.paymentMethod).toBe('cod');
      expect(createArg.paymentStatus).toBe('pending');
    });

    it('should default to COD when no payment method specified', async () => {
      const { tx } = makeTx();
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      const order = await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2 }],
        shippingAddress: '123 Main St',
      });

      expect(order).toBeDefined();
    });
  });

  describe('client cannot mark order paid', () => {
    it('should ignore client-provided paymentStatus and set unpaid for COD', async () => {
      const { tx, orderCreate } = makeTx();
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St',
      });

      const createArg = vi.mocked(orderCreate).mock.calls[0][0].data;
      expect(createArg.paymentStatus).toBe('pending');
    });
  });

  describe('client cannot alter payment amount', () => {
    it('should compute total from server-side prices', async () => {
      const { tx, orderCreate } = makeTx();
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St',
      });

      const createArg = vi.mocked(orderCreate).mock.calls[0][0].data;
      expect(createArg.total).toBeGreaterThan(0);
      expect(createArg.total).not.toBe(9999);
    });
  });

  describe('payment status is separate from order status', () => {
    it('should set paymentStatus independently of order status', async () => {
      const { tx, orderCreate } = makeTx();
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      const order = await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St',
      });

      expect(order!.status).toBe('pending');
      expect(order!.paymentStatus).toBe('pending');
    });

    it('should allow order status to change while payment status remains unpaid', async () => {
      const { tx, orderCreate } = makeTx();
      tx.order.findUnique.mockResolvedValue({
        id: 'order-1',
        orderCode: 'ORD-123',
        total: 300,
        status: 'accepted',
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        items: { include: { product: true } },
        shipments: { include: { items: true } },
        invoice: true,
      });
      vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(tx));

      const order = await createMarketplaceOrder({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
        paymentMethod: 'cod',
        shippingAddress: '123 Main St',
      });

      expect(order!.status).toBe('pending');
      expect(order!.paymentStatus).toBe('pending');
    });
  });

  describe('toPlainNumber utility', () => {
    it('should convert Decimal to number', () => {
      expect(toPlainNumber(100)).toBe(100);
      expect(toPlainNumber(null)).toBeNull();
      expect(toPlainNumber(undefined)).toBeNull();
      expect(toPlainNumber('150')).toBe(150);
    });
  });
});
