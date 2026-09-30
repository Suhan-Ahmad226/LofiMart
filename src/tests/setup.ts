import { vi } from 'vitest';

vi.mock('@prisma/client', () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    orderShipment: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    orderShipmentItem: {
      create: vi.fn(),
    },
    coupon: {
      findUnique: vi.fn(),
    },
    inventoryItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    stockReservation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryMovement: {
      create: vi.fn(),
    },
    warehouse: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn({
      order: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
      orderItem: { findMany: vi.fn(), create: vi.fn() },
      product: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      inventoryItem: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), aggregate: vi.fn() },
      stockReservation: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      inventoryMovement: { create: vi.fn() },
      orderShipment: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
      orderShipmentItem: { create: vi.fn() },
      coupon: { findUnique: vi.fn() },
      warehouse: { findUnique: vi.fn(), update: vi.fn() },
    })),
    $queryRaw: vi.fn(),
  };

  return { PrismaClient: vi.fn(() => mockPrisma), mockPrisma };
});

export const mockPrisma = (await import('@prisma/client')).PrismaClient as unknown as ReturnType<typeof vi.fn>;
