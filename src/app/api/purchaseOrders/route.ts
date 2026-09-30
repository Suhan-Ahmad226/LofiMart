import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const isAdmin = user.role === 'admin';
  const warehouseIds = isAdmin
    ? undefined
    : (
        await prisma.warehouse.findMany({
          where: { managerId: String(user.id) },
          select: { id: true },
        })
      ).map((warehouse) => warehouse.id);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: warehouseIds === undefined ? undefined : { warehouseId: { in: warehouseIds } },
    orderBy: { createdAt: 'desc' },
    include: {
      lines: true,
    },
  });

  return NextResponse.json(purchaseOrders.map((purchaseOrder) => ({
    id: purchaseOrder.id,
    supplierId: purchaseOrder.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    warehouseId: purchaseOrder.warehouseId,
    items: purchaseOrder.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: toPlainNumber(line.unitCost),
    })),
    status: purchaseOrder.status,
    createdAt: purchaseOrder.createdAt.toISOString(),
    updatedAt: purchaseOrder.updatedAt.toISOString(),
  })));
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) || {};
  const { supplierId, warehouseId, items, status } = body ?? {};

  if (!warehouseId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'warehouseId and items are required' }, { status: 400 });
  }

  if (user.role !== 'admin') {
    const owned = await prisma.warehouse.findFirst({
      where: { id: String(warehouseId), managerId: String(user.id) },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      warehouseId: String(warehouseId),
      supplierName: String(supplierId || 'supplier'),
      status: typeof status === 'string' ? status : 'draft',
      lines: {
        create: items.map((item: any) => ({
          productId: String(item.productId),
          quantity: Number(item.quantity ?? 0),
          unitCost: Number(item.unitCost ?? 0),
        })),
      },
    },
    include: {
      lines: true,
    },
  });

  return NextResponse.json({
    id: purchaseOrder.id,
    supplierId: purchaseOrder.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    warehouseId: purchaseOrder.warehouseId,
    items: purchaseOrder.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: toPlainNumber(line.unitCost),
    })),
    status: purchaseOrder.status,
    createdAt: purchaseOrder.createdAt.toISOString(),
    updatedAt: purchaseOrder.updatedAt.toISOString(),
  }, { status: 201 });
}
