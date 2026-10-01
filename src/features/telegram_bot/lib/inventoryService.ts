import { prisma } from '@/lib/server';
import { sendLowStockAlert } from './notificationService';

type StockLine = {
  productId: string;
  quantity: number;
  reference: string;
  warehouseId?: string;
};

export async function reduceStockForOrder(lines: StockLine[]) {
  for (const line of lines) {
    const product = await prisma.product.findUnique({
      where: { id: line.productId },
      select: { id: true, name: true, stock: true, sellerId: true },
    });

    if (!product) {
      throw new Error(`Product not found: ${line.productId}`);
    }

    if (product.stock < line.quantity) {
      throw new Error(`Insufficient stock for ${product.name}`);
    }

    const updated = await prisma.product.update({
      where: {
        id: product.id,
        stock: { gte: line.quantity },
      },
      data: {
        stock: { decrement: line.quantity },
      },
      select: { id: true, name: true, stock: true, sellerId: true },
    });

    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        productId: product.id,
        ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (inventoryItem) {
      await prisma.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          quantity: Math.max(0, inventoryItem.quantity - line.quantity),
          movements: {
            create: {
              productId: product.id,
              warehouseId: inventoryItem.warehouseId,
              type: 'sale',
              quantityDelta: -line.quantity,
              reason: 'telegram_order_created',
              reference: line.reference,
            },
          },
        },
      });
    }

    const threshold = inventoryItem?.reorderLevel ?? Number(process.env.LOW_STOCK_THRESHOLD || 5);
    if (updated.sellerId && updated.stock <= threshold) {
      await sendLowStockAlert({
        sellerId: updated.sellerId,
        productName: updated.name,
        stock: updated.stock,
        threshold,
      });
    }
  }
}

export async function restoreStockForOrder(lines: StockLine[]) {
  for (const line of lines) {
    const quantity = Math.max(1, Number(line.quantity || 1));

    const product = await prisma.product.update({
      where: { id: line.productId },
      data: {
        stock: { increment: quantity },
      },
      select: { id: true },
    });

    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: {
        productId: product.id,
        ...(line.warehouseId ? { warehouseId: line.warehouseId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (inventoryItem) {
      await prisma.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          quantity: { increment: quantity },
          movements: {
            create: {
              productId: product.id,
              warehouseId: inventoryItem.warehouseId,
              type: 'return',
              quantityDelta: quantity,
              reason: 'telegram_order_cancelled',
              reference: line.reference,
            },
          },
        },
      });
    }
  }
}
