import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reserveStock,
  releaseReservation,
  consumeReservation,
  releaseExpiredReservations,
  getAvailableStock,
  pickFulfilmentInventory,
  resetProductStockCache,
} from '@/modules/inventory/stockOps';

describe('inventory.test.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockTx = () => ({
    inventoryItem: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    stockReservation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    inventoryMovement: { create: vi.fn() },
    product: { update: vi.fn(), updateMany: vi.fn() },
  });

  describe('stock cannot go negative', () => {
    it('should reject reservation when stock is zero (not_available)', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.findFirst).mockResolvedValue({
        id: 'inv-1',
        warehouseId: 'wh-1',
        quantity: 0,
      });

      const result = await reserveStock(tx, {
        productId: 'prod-1',
        quantity: 1,
        reference: 'ref-1',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('not_available');
    });

    it('should reject reservation when quantity exceeds stock', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.findFirst).mockResolvedValue({
        id: 'inv-1',
        warehouseId: 'wh-1',
        quantity: 3,
      });
      vi.mocked(tx.inventoryItem.updateMany).mockResolvedValue({ count: 0 });

      const result = await reserveStock(tx, {
        productId: 'prod-1',
        quantity: 5,
        reference: 'ref-1',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('insufficient_stock');
    });

    it('should allow reservation when stock is sufficient', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.findFirst).mockResolvedValue({
        id: 'inv-1',
        warehouseId: 'wh-1',
        quantity: 10,
      });
      vi.mocked(tx.inventoryItem.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(tx.stockReservation.create).mockResolvedValue({
        id: 'res-1',
        status: 'reserved',
        expiresAt: new Date(Date.now() + 120 * 60 * 1000),
      });
      vi.mocked(tx.inventoryMovement.create).mockResolvedValue(undefined);
      vi.mocked(tx.product.update).mockResolvedValue({ id: 'prod-1', stock: 5 });
      vi.mocked(tx.inventoryItem.update).mockResolvedValue({ id: 'inv-1', quantity: 5 });
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({ _sum: { quantity: 5 } });

      const result = await reserveStock(tx, {
        productId: 'prod-1',
        quantity: 5,
        reference: 'ref-1',
      });

      expect(result.ok).toBe(true);
      expect(result.quantity).toBe(5);
      expect(result.reservationId).toBe('res-1');
    });
  });

  describe('reservation behavior', () => {
    it('should create reservation with correct fields', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.findFirst).mockResolvedValue({
        id: 'inv-1',
        warehouseId: 'wh-1',
        quantity: 10,
      });
      vi.mocked(tx.inventoryItem.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(tx.stockReservation.create).mockResolvedValue({
        id: 'res-1',
        status: 'reserved',
        expiresAt: new Date(Date.now() + 120 * 60 * 1000),
      });
      vi.mocked(tx.inventoryMovement.create).mockResolvedValue(undefined);
      vi.mocked(tx.product.update).mockResolvedValue({ id: 'prod-1', stock: 5 });
      vi.mocked(tx.inventoryItem.update).mockResolvedValue({ id: 'inv-1', quantity: 5 });
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({ _sum: { quantity: 5 } });

      const result = await reserveStock(tx, {
        productId: 'prod-1',
        quantity: 5,
        reference: 'ref-1',
        reservationMinutes: 60,
      });

      expect(result.ok).toBe(true);
      expect(tx.stockReservation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          warehouseId: 'wh-1',
          inventoryItemId: 'inv-1',
          quantity: 5,
          status: 'reserved',
        }),
      });
    });

    it('should release reservation and restore stock', async () => {
      const tx = mockTx();
      vi.mocked(tx.stockReservation.findFirst).mockResolvedValue({
        id: 'res-1',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        inventoryItemId: 'inv-1',
        quantity: 5,
        status: 'reserved',
      });
      vi.mocked(tx.inventoryItem.update).mockResolvedValue({ id: 'inv-1' });
      vi.mocked(tx.stockReservation.update).mockResolvedValue({ id: 'res-1' });
      vi.mocked(tx.inventoryMovement.create).mockResolvedValue(undefined);
      vi.mocked(tx.product.update).mockResolvedValue({ id: 'prod-1', stock: 10 });
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({ _sum: { quantity: 10 } });

      await releaseReservation(tx, 'res-1', 'cancel');

      expect(tx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          quantity: { increment: 5 },
          reserved: { decrement: 5 },
        },
      });
    });

    it('should consume reservation without restoring stock', async () => {
      const tx = mockTx();
      vi.mocked(tx.stockReservation.findFirst).mockResolvedValue({
        id: 'res-1',
        productId: 'prod-1',
        warehouseId: 'wh-1',
        inventoryItemId: 'inv-1',
        quantity: 5,
        status: 'reserved',
      });
      vi.mocked(tx.inventoryItem.update).mockResolvedValue({ id: 'inv-1' });
      vi.mocked(tx.stockReservation.update).mockResolvedValue({ id: 'res-1' });
      vi.mocked(tx.product.update).mockResolvedValue({ id: 'prod-1', stock: 5 });
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({ _sum: { quantity: 5 } });

      await consumeReservation(tx, 'res-1');

      expect(tx.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { reserved: { decrement: 5 } },
      });
    });
  });

  describe('reservation expiration releases stock', () => {
    it('should release expired reservations', async () => {
      const tx = mockTx();
      const now = new Date();
      vi.mocked(tx.stockReservation.findMany).mockResolvedValue([
        {
          id: 'res-expired',
          productId: 'prod-1',
          warehouseId: 'wh-1',
          inventoryItemId: 'inv-1',
          quantity: 3,
          status: 'reserved',
        },
      ]);
      vi.mocked(tx.inventoryItem.update).mockResolvedValue({ id: 'inv-1' });
      vi.mocked(tx.stockReservation.update).mockResolvedValue({ id: 'res-expired' });
      vi.mocked(tx.inventoryMovement.create).mockResolvedValue(undefined);
      vi.mocked(tx.product.update).mockResolvedValue({ id: 'prod-1', stock: 8 });
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({ _sum: { quantity: 8 } });

      const released = await releaseExpiredReservations(tx);

      expect(released).toBe(1);
      expect(tx.stockReservation.update).toHaveBeenCalledWith({
        where: { id: 'res-expired' },
        data: { status: 'expired' },
      });
    });

    it('should not release non-expired reservations', async () => {
      const tx = mockTx();
      vi.mocked(tx.stockReservation.findMany).mockResolvedValue([]);

      const released = await releaseExpiredReservations(tx);

      expect(released).toBe(0);
    });
  });

  describe('getAvailableStock', () => {
    it('should sum inventory item quantities', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({
        _sum: { quantity: 42 },
      });

      const stock = await getAvailableStock(tx, 'prod-1');
      expect(stock).toBe(42);
    });

    it('should return 0 when no inventory items', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({
        _sum: { quantity: null },
      });

      const stock = await getAvailableStock(tx, 'prod-1');
      expect(stock).toBe(0);
    });
  });

  describe('pickFulfilmentInventory', () => {
    it('should return inventory item with highest quantity', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.findFirst).mockResolvedValue({
        id: 'inv-1',
        warehouseId: 'wh-1',
        quantity: 100,
      });

      const result = await pickFulfilmentInventory(tx, 'prod-1');
      expect(result).toEqual({ inventoryItemId: 'inv-1', warehouseId: 'wh-1' });
    });

    it('should return null when no available inventory', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.findFirst).mockResolvedValue(null);

      const result = await pickFulfilmentInventory(tx, 'prod-1');
      expect(result).toBeNull();
    });
  });

  describe('resetProductStockCache', () => {
    it('should update product stock from available inventory', async () => {
      const tx = mockTx();
      vi.mocked(tx.inventoryItem.aggregate).mockResolvedValue({
        _sum: { quantity: 25 },
      });
      vi.mocked(tx.product.update).mockResolvedValue({ id: 'prod-1', stock: 25 });

      const stock = await resetProductStockCache(tx, 'prod-1');
      expect(stock).toBe(25);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { stock: 25 },
      });
    });
  });
});
