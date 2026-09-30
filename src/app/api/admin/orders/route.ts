import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { requireApiUser, requireAdminRole, toPlainNumber } from '../../_compat/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  try {
    const orders = await prisma.order.findMany({
      orderBy: [{ createdAt: 'desc' }],
      include: {
        user: { select: { name: true, email: true } },
        items: {
          include: {
            product: { select: { sku: true, name: true } },
          },
        },
        shipments: {
          orderBy: { createdAt: 'asc' },
          include: {
            warehouse: { select: { name: true } },
          },
        },
      },
      take: 1000,
    });

    return NextResponse.json(
      orders.map((order) => ({
        id: order.id,
        order_code: order.orderCode ?? null,
        customer_name: order.user?.name ?? null,
        customer_email: order.user?.email ?? null,
        total: toPlainNumber(order.total) ?? 0,
        status: order.status,
        courier_provider: order.courierProvider ?? null,
        tracking_id: order.trackingId ?? null,
        delivery_failure_reason: order.deliveryFailureReason ?? null,
        created_at: order.createdAt.toISOString(),
        shipments: order.shipments.map((shipment) => ({
          id: shipment.id,
          status: shipment.status,
          warehouse_name: shipment.warehouse?.name ?? null,
          courier_provider: shipment.courierProvider ?? null,
          tracking_id: shipment.trackingId ?? null,
          delivery_failure_reason: shipment.deliveryFailureReason ?? null,
        })),
        items: order.items.map((item) => ({
          id: item.id,
          sku: item.product.sku ?? null,
          name: item.product.name ?? null,
          variant_summary: item.variantSummary ?? null,
        })),
      })),
    );
  } catch (error) {
    console.error('GET /api/admin/orders error:', error);
    return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 });
  }
}