import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server';
import { getCourierProvider } from '@/features/courier/registry/providerRegistry';
import { assertSupports } from '@/features/courier/registry/providerRegistry';
import {
  recordManualTrackingId,
  ShipmentNotBookableError,
} from '@/features/courier/services/bookingService';
import { isCourierError } from '@/features/courier/core/errors';
import { enqueueCourierBooking } from '@/workers/queue';
import { requireApiUser, requireSellerRole, toPlainNumber } from '../../../_compat/shared';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Seller bookings.
 *
 * Booking is queued rather than performed inline. Three reasons, in order of
 * importance:
 *
 *  1. A create call to a courier can hang. Answering the seller's browser while
 *     that is still in flight means a browser timeout looks like a failure, and
 *     the natural reaction — click again — is a second booking.
 *  2. `bookShipment` is idempotent, so a queue retry is safe, but the reverse is
 *     not true of an HTTP retry handled by a human.
 *  3. The response shape becomes honest. A 202 says "the courier has been asked",
 *     which is the truth; a 200 with a tracking id implies the work already
 *     succeeded.
 *
 * A seller-entered tracking id is the exception: it contacts no courier, so it
 * stays synchronous and answers 200.
 */
export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const sellerId = String(user.id);

  try {
    const bookings = await prisma.orderShipment.findMany({
      where: { sellerId, order: { tenantId: user.tenantId ?? undefined } },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            status: true,
            total: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        warehouse: { select: { id: true, name: true, city: true } },
      },
    });

    return NextResponse.json(
      bookings.map((booking) => ({
        id: booking.id,
        order_id: booking.orderId,
        order_code: booking.order?.orderCode ?? null,
        seller_id: booking.sellerId,
        warehouse_id: booking.warehouseId,
        warehouse: booking.warehouse ?? null,
        status: booking.status,
        courier_provider: booking.courierProvider ?? null,
        tracking_id: booking.trackingId ?? null,
        // Exposed so the UI can explain *why* a booking is stuck instead of
        // showing an indefinitely spinning button.
        booking_state: booking.bookingState,
        booking_error: booking.lastBookingError ?? null,
        total: toPlainNumber(booking.total),
        item_count: booking.itemCount,
        customer_name: booking.order?.user?.name ?? null,
        customer_phone: booking.order?.user?.phone ?? null,
        created_at: booking.createdAt ? new Date(booking.createdAt).toISOString() : undefined,
        updated_at: booking.updatedAt ? new Date(booking.updatedAt).toISOString() : undefined,
      })),
    );
  } catch (error) {
    console.error('GET /api/seller/courier/bookings error:', error);
    return NextResponse.json({ error: 'Failed to load courier bookings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;
  const roleError = requireSellerRole(user);
  if (roleError) return roleError;

  const body = await request.json().catch(() => ({}));
  const shipmentId = typeof body?.shipmentId === 'string' ? body.shipmentId.trim() : '';
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
  const requestedProvider = typeof (body?.provider ?? body?.providerCode) === 'string'
    ? String(body.provider ?? body.providerCode).trim().toLowerCase()
    : '';
  const trackingId = typeof body?.trackingId === 'string' ? body.trackingId.trim() : '';
  const warehouseId = typeof body?.warehouseId === 'string' ? body.warehouseId.trim() : '';

  // Pathao is the only active provider, so older shipments without an assigned
  // provider can still use the one-click seller booking flow.
  const provider = trackingId ? requestedProvider : (requestedProvider || 'pathao');
  const courierProvider = trackingId ? null : getCourierProvider(provider);

  if (!shipmentId && !orderId) {
    return NextResponse.json({ error: 'shipmentId or orderId is required.' }, { status: 400 });
  }

  if (!trackingId && !courierProvider) {
    return NextResponse.json(
      { error: `Courier provider "${provider || 'unknown'}" is not available.` },
      { status: 400 },
    );
  }

  // Resolved up front so an unsupported operation is refused before a job is
  // queued, rather than failing repeatedly inside the worker. `assertSupports`
  // throws rather than returning a flag, so the refusal is a typed catch rather
  // than a truthiness test.
  if (courierProvider) {
    try {
      assertSupports(courierProvider, 'createShipment');
    } catch (error) {
      if (isCourierError(error)) {
        return NextResponse.json(
          { error: 'The selected courier cannot create consignments through this integration.' },
          { status: 400 },
        );
      }
      throw error;
    }
  }

  const sellerId = String(user.id);
  const isAdmin = user.role === 'admin';
  if (!isAdmin && !user.tenantId) {
    return NextResponse.json({ error: 'Seller tenant context is required.' }, { status: 403 });
  }

  try {
    const shipment = shipmentId
      ? await findSellerShipment(shipmentId, sellerId, isAdmin, user.tenantId)
      : await findOrCreateShipmentFromOrder({ orderId, sellerId, warehouseId, isAdmin, tenantId: user.tenantId });

    if (!shipment) {
      return NextResponse.json({ error: 'Shipment not found.' }, { status: 404 });
    }

    if (trackingId) {
      // No courier call, so no reason to defer it.
      const result = await recordManualTrackingId(shipment.id, trackingId, provider);

      return NextResponse.json({
        success: true,
        queued: false,
        booking_state: 'booked',
        booking: {
          provider_code: provider,
          tracking_id: result.trackingId,
          mode: 'manual',
        },
        shipment: {
          id: result.shipmentId,
          status: result.status,
          courier_provider: provider,
          tracking_id: result.trackingId,
        },
      });
    }

    const job = await enqueueCourierBooking({ shipmentId: shipment.id, providerCode: provider });

    return NextResponse.json(
      {
        success: true,
        queued: true,
        // The UI polls the shipment, not the job, so this is informational.
        job_id: job?.id ?? null,
        booking: {
          provider_code: provider,
          tracking_id: null,
          mode: 'api',
        },
        shipment: {
          id: shipment.id,
          status: shipment.status,
          courier_provider: provider,
          tracking_id: null,
        },
        message: 'The courier has been asked to collect this parcel. Tracking will appear here shortly.',
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ShipmentNotBookableError) {
      // 409: the shipment is in a state where booking makes no sense. Retrying
      // without changing something will not help.
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (isCourierError(error)) {
      logger.error('Seller courier booking failed.', {
        sellerId,
        provider,
        code: error.code,
      });
      return NextResponse.json({ error: error.customerMessage }, { status: 503 });
    }

    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A booking already exists for this order.' }, { status: 409 });
    }

    console.error('POST /api/seller/courier/bookings error:', error);
    return NextResponse.json({ error: 'Failed to create courier booking' }, { status: 500 });
  }
}

async function findSellerShipment(shipmentId: string, sellerId: string, isAdmin: boolean, tenantId: string | null) {
  return prisma.orderShipment.findFirst({
    where: { id: shipmentId, order: tenantId ? { tenantId } : undefined, ...(isAdmin ? {} : { sellerId }) },
    select: { id: true, orderId: true, warehouseId: true, status: true },
  });
}

/**
 * Resolves the shipment for an order, creating one if the seller has none yet.
 *
 * Reuses the seller's earliest shipment for the order. `OrderShipment` has no
 * unique constraint on `(orderId, sellerId)`, so creating one blindly would let
 * a retried request fan out into several shipments — and several parcels.
 */
async function findOrCreateShipmentFromOrder({
  orderId,
  sellerId,
  warehouseId,
  isAdmin,
  tenantId,
}: {
  orderId: string;
  sellerId: string;
  warehouseId: string;
  isAdmin: boolean;
  tenantId: string | null;
}: {
  orderId: string;
  sellerId: string;
  warehouseId: string;
  isAdmin: boolean;
}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      total: true,
      items: { select: { product: { select: { sellerId: true } } } },
    },
  });

  if (!order) return null;

  const ownsOrder = order.items.some((item) => item.product?.sellerId === sellerId);
  if (!ownsOrder && !isAdmin) return null;

  if (!isAdmin && warehouseId) {
    const warehouse = await prisma.warehouse.findFirst({
      where: {
        id: warehouseId,
        managerId: sellerId,
      },
      select: { id: true },
    });
    if (!warehouse) return null;
  }

  const existing = await prisma.orderShipment.findFirst({
    where: { orderId, sellerId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, orderId: true, warehouseId: true, status: true },
  });

  if (existing) return existing;

  return prisma.orderShipment.create({
    data: {
      orderId,
      sellerId,
      warehouseId: warehouseId || null,
      status: 'processing',
      total: order.total,
      itemCount: order.items.length,
    },
    select: { id: true, orderId: true, warehouseId: true, status: true },
  });
}
