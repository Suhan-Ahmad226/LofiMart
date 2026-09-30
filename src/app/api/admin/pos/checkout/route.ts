import crypto from 'crypto';

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/app/api/products/shared';
import { requireAdminRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { toPlainNumber } from '@/app/api/products/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function generateUniqueOrderCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = crypto.randomBytes(4).toString('hex').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const orderCode = `ORD-${suffix}`;
    const existing = await prisma.order.findUnique({
      where: { orderCode },
      select: { id: true },
    });
    if (!existing) {
      return orderCode;
    }
  }
  return `ORD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireAdminRole(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({})) || {};
  const items = Array.isArray(body?.items) ? body.items : [];
  const paymentMethod = String(body?.paymentMethod || 'cash').trim().toLowerCase();
  const customerName = String(body?.customerName || '').trim() || 'Walk-in Customer';
  const customerPhone = String(body?.customerPhone || '').trim();
  const note = String(body?.note || '').trim();
  const selectedWarehouseId = String(body?.warehouseId || '').trim();

  if (items.length === 0) {
    return NextResponse.json({ error: 'Select at least one product for the POS cart.' }, { status: 400 });
  }

  const normalizedItems = items
    .map((item: any) => ({
      productId: String(item?.productId || item?.id || '').trim(),
      quantity: Math.max(1, Math.floor(Number(item?.quantity || 0))),
    }))
    .filter((item: { productId: string; quantity: number }) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);

  if (normalizedItems.length === 0) {
    return NextResponse.json({ error: 'POS cart items are invalid.' }, { status: 400 });
  }

  const walkInCustomer = await ensurePosWalkInCustomer(user.tenantId ?? null);
  const productIds = normalizedItems.map((item: { productId: string; quantity: number }) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      sellerId: true,
      inventoryItems: {
        select: {
          warehouseId: true,
          quantity: true,
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ quantity: 'desc' }],
      },
    },
  });

  const productById = new Map(products.map((product) => [String(product.id), product]));
  for (const item of normalizedItems) {
    const product = productById.get(item.productId);
    if (!product) {
      return NextResponse.json({ error: `Product ${item.productId} not found.` }, { status: 404 });
    }
    if (Number(product.stock) < item.quantity) {
      return NextResponse.json({ error: `${product.name} only has ${product.stock} unit(s) available.` }, { status: 400 });
    }
    if (selectedWarehouseId) {
      const warehouseEntry = product.inventoryItems.find((entry) => entry.warehouseId === selectedWarehouseId);
      if (!warehouseEntry || Number(warehouseEntry.quantity) < item.quantity) {
        return NextResponse.json({ error: `${product.name} does not have enough stock in the selected warehouse.` }, { status: 400 });
      }
    }
  }

  const createdOrder = await prisma.$transaction(async (tx) => {
    const computedItems = normalizedItems.map((item: { productId: string; quantity: number }) => {
      const product = productById.get(item.productId)!;
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: Number(toPlainNumber(product.price) ?? 0),
        sellerId: product.sellerId ?? String(user.id),
        warehouseId:
          selectedWarehouseId ||
          product.inventoryItems.find((entry) => Number(entry.quantity) > 0)?.warehouseId ||
          null,
      };
    });

    const total = computedItems.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
    const now = new Date();
    const orderCode = await generateUniqueOrderCode();
    const order = await tx.order.create({
      data: {
        orderCode,
        userId: String(walkInCustomer.id),
        tenantId: user.tenantId ?? null,
        total,
        status: 'delivered',
        paymentMethod,
        paymentProvider: 'pos',
        paymentStatus: 'paid',
        paidAt: now,
        deliveredAt: now,
        shippingAddress: {
          name: customerName,
          phone: customerPhone || null,
          address: 'POS Counter Sale',
          city: 'In-store',
          note: note || null,
          pos_sale: true,
        },
        shipmentMetadata: {
          pos_sale: true,
          cashierId: String(user.id),
          cashierName: user.name ?? 'Admin Cashier',
          note: note || null,
          warehouseId: selectedWarehouseId || null,
        },
        items: {
          create: computedItems.map((item: any) => ({
            productId: item.productId,
            qty: item.quantity,
            price: item.price,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    const orderItemsByProductId = new Map<string, { id: string; qty: number; price: number }[]>();
    for (const orderItem of order.items) {
      const bucket = orderItemsByProductId.get(orderItem.productId) ?? [];
      bucket.push({
        id: orderItem.id,
        qty: Number(orderItem.qty),
        price: Number(orderItem.price),
      });
      orderItemsByProductId.set(orderItem.productId, bucket);
    }

    const shipmentGroups = new Map<string, {
      sellerId: string;
      warehouseId: string | null;
      total: number;
      itemCount: number;
      items: { orderItemId: string; productId: string; qty: number; price: number }[];
    }>();

    for (const item of computedItems) {
      const key = `${item.sellerId}::${item.warehouseId ?? 'pos-counter'}`;
      const group = shipmentGroups.get(key) ?? {
        sellerId: item.sellerId,
        warehouseId: item.warehouseId,
        total: 0,
        itemCount: 0,
        items: [] as { orderItemId: string; productId: string; qty: number; price: number }[],
      };

      const linkedOrderItems = orderItemsByProductId.get(item.productId) ?? [];
      const linkedOrderItem = linkedOrderItems.shift();
      orderItemsByProductId.set(item.productId, linkedOrderItems);
      if (!linkedOrderItem) continue;

      group.total += linkedOrderItem.price * linkedOrderItem.qty;
      group.itemCount += linkedOrderItem.qty;
      group.items.push({
        orderItemId: linkedOrderItem.id,
        productId: item.productId,
        qty: linkedOrderItem.qty,
        price: linkedOrderItem.price,
      } as any);
      shipmentGroups.set(key, group);
    }

    for (const group of shipmentGroups.values()) {
      const shipment = await tx.orderShipment.create({
        data: {
          orderId: order.id,
          sellerId: group.sellerId,
          warehouseId: group.warehouseId,
          status: 'delivered',
          total: group.total,
          itemCount: group.itemCount,
          courierProvider: 'pos',
          deliveredAt: now,
          shipmentMetadata: {
            pos_sale: true,
            cashierId: String(user.id),
          },
        },
      });

      if (group.items.length > 0) {
        await tx.orderShipmentItem.createMany({
          data: group.items.map((shipmentItem) => ({
            shipmentId: shipment.id,
            orderItemId: shipmentItem.orderItemId,
            productId: shipmentItem.productId,
            qty: shipmentItem.qty,
            price: shipmentItem.price,
          })),
        });
      }
    }

    for (const item of computedItems) {
      if (item.warehouseId) {
        const decrement = await tx.inventoryItem.updateMany({
          where: {
            productId: item.productId,
            warehouseId: item.warehouseId,
            quantity: { gte: item.quantity },
          },
          data: {
            quantity: { decrement: item.quantity },
          },
        });
        if (decrement.count !== 1) {
          throw new Error(`Insufficient stock for ${item.productId}.`);
        }
      } else {
        const decrement = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });
        if (decrement.count !== 1) {
          throw new Error(`Insufficient stock for ${item.productId}.`);
        }
      }
    }

    await tx.invoice.create({
      data: {
        orderId: order.id,
        userId: walkInCustomer.id,
        status: 'paid',
        subtotal: total,
        tax: 0,
        total,
      },
    });

    await tx.paymentTransaction.create({
      data: {
        provider: 'pos',
        paymentId: `POS-${order.id}`,
        orderId: order.id,
        customerId: walkInCustomer.id,
        amount: total,
        currency: 'BDT',
        status: 'paid',
        idempotencyKey: crypto.randomUUID(),
        metadata: {
          paymentMethod,
          cashierId: String(user.id),
          cashierName: user.name ?? 'Admin Cashier',
          customerName,
          customerPhone: customerPhone || null,
          note: note || null,
          pos: true,
        },
      },
    });

    const fullOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return fullOrder!;
  });

  function serializePosOrder(order: any) {
    return {
      id: order.id,
      order_code: order.orderCode ?? null,
      user_id: order.userId,
      total: toPlainNumber(order.total),
      status: order.status,
      courier_provider: order.courierProvider ?? null,
      tracking_id: order.trackingId ?? null,
      payment_method: order.paymentMethod ?? null,
      payment_provider: order.paymentProvider ?? null,
      payment_status: order.paymentStatus ?? null,
      paid_at: order.paidAt ? new Date(order.paidAt).toISOString() : null,
      shipping_address: order.shippingAddress ?? null,
      items: Array.isArray(order.items)
        ? order.items.map((item: any) => ({
            id: item.id,
            product_id: item.productId,
            product_name: item.product?.name ?? null,
            qty: item.qty,
            price: toPlainNumber(item.price),
          }))
        : [],
      created_at: order.createdAt ? new Date(order.createdAt).toISOString() : undefined,
    };
  }

  return NextResponse.json({
    success: true,
    orderId: createdOrder.id,
    receipt: serializePosOrder(createdOrder),
  });
}

async function ensurePosWalkInCustomer(tenantId: string | null) {
  const customer = await prisma.user.findFirst({
    where: {
      email: 'walk-in@lofimart.local',
      role: 'customer',
      ...(tenantId ? { tenantId } : {}),
    },
  });
  if (customer) return customer;
   return prisma.user.create({
    data: {
      email: 'walk-in@lofimart.local',
      name: 'Walk-in Customer',
      role: 'customer',
      tenantId,
    } as any,
  });
}
