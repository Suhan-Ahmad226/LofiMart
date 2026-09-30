import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) || {};
  const nextStatus = String(body?.status ?? '').trim();
  if (!nextStatus) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  if (user.role !== 'admin') {
    const existing = await prisma.purchaseOrder.findFirst({
      where: {
        id,
        warehouse: { managerId: String(user.id) },
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const purchaseOrder = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: nextStatus },
    include: { lines: true },
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
  });
}
