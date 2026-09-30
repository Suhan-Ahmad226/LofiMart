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

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      supplierName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const suppliers = Array.from(new Map(
    purchaseOrders
      .filter((po) => po.supplierName.trim().length > 0)
      .map((po) => [
        po.supplierName.toLowerCase(),
        {
          id: po.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: po.supplierName,
          contact: {},
          productsSupplied: [],
          rating: undefined,
          createdAt: po.createdAt.toISOString(),
          updatedAt: po.updatedAt.toISOString(),
        },
      ]),
  ).values());

  return NextResponse.json(suppliers);
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  if (!['admin', 'seller'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) || {};
  const { name, contact, productsSupplied } = body ?? {};
  const supplierName = String(name ?? '').trim();

  if (!supplierName) {
    return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
  }

  const supplier = {
    id: supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: supplierName,
    contact: contact && typeof contact === 'object' ? contact : {},
    productsSupplied: Array.isArray(productsSupplied) ? productsSupplied.map(String) : [],
    rating: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(supplier, { status: 201 });
}
