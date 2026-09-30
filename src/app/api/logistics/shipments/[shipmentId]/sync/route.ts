import { NextRequest, NextResponse } from 'next/server';

import { requireApiUser } from '@/app/api/products/shared';
import { requireRole } from '@/app/api/_compat/shared';
import { prisma } from '@/lib/server';
import { reconcileShipment } from '@/features/courier/services/reconciliationService';
import { createNotification } from '@/features/shared/services/notifications/notificationService';
import { syncResellerSettlementFromShipmentStatus } from '@/features/reseller/services/resellerSettlement';
import { getShipmentStatusLabel } from '@/features/courier/core/status';
import { listCourierProviders } from '@/features/courier/registry/providerRegistry';
import { logger } from '@/lib/logger';
import {
  courierErrorResponse,
  normalizeProviderCode,
  requireProviderViewOr404,
} from '../../../_shared/routeHelpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Force a status refresh for one shipment.
 *
 * This used to be `POST /api/logistics/pathao/shipments/{id}/sync` and it
 * inlined Pathao's status vocabulary, its own copy of the timestamp logic, and a
 * `pathaoLastStatusSlug` write into `shipmentMetadata`. All three are now owned
 * by the provider adapter and `reconcileShipment`, so the same route refreshes a
 * shipment with any future courier — and cannot drag a delivered parcel backwards
 * or double-notify, because the transition rules live in one place.
 *
 * The provider is inferred from the shipment. A `?provider=` override exists only
 * for a shipment whose provider was never recorded; it cannot re-point a shipment
 * at a different courier, which would let a caller reconcile one courier's parcel
 * against another's API.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const user = await requireApiUser(request);
  if (user instanceof NextResponse) return user;

  const roleError = requireRole(['admin', 'seller'])(user);
  if (roleError) return roleError;

  const { shipmentId } = await params;
  if (!shipmentId) {
    return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  }

  // Ownership is part of the lookup, not a check afterwards: a seller passing
  // another seller's shipment id gets the same 404 as a nonexistent one, so the
  // endpoint cannot be used to probe for valid ids.
  const shipment = await prisma.orderShipment.findFirst({
    where:
      user.role === 'admin' ? { id: shipmentId } : { id: shipmentId, sellerId: String(user.id) },
    select: {
      id: true,
      orderId: true,
      status: true,
      courierProvider: true,
      trackingId: true,
      order: { select: { userId: true, tenantId: true } },
    },
  });

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  }

  const override = normalizeProviderCode(
    new URL(request.url).searchParams.get('provider'),
  );
  const providerCode = shipment.courierProvider ?? override;

  if (!providerCode) {
    return NextResponse.json(
      { error: 'This shipment has no courier assigned yet.' },
      { status: 400 },
    );
  }

  const { response: guard } = requireProviderViewOr404(providerCode);
  if (guard) return guard;

  if (override && shipment.courierProvider && override !== shipment.courierProvider) {
    return NextResponse.json(
      { error: 'The requested courier does not match the courier assigned to this shipment.' },
      { status: 409 },
    );
  }

  try {
    const result = await reconcileShipment(shipment.id, providerCode);

    // `reconcileShipment` only advances the status; the app-side consequences
    // live here so a redelivery cannot fire them twice. Skipped unless the
    // status actually moved.
    if (result.status && result.status !== shipment.status) {
      const userId = shipment.order?.userId;
      if (userId) {
        await createNotification({
          userId,
          tenantId: shipment.order?.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment status refreshed',
          message: `Your shipment is now ${getShipmentStatusLabel(result.status).toLowerCase()}.`,
          actionUrl: `/account/orders/${shipment.orderId}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.orderId,
            shipmentId: shipment.id,
            status: result.status,
            courierProvider: providerCode,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.orderId, result.status);
    }

    const updated = await prisma.orderShipment.findUnique({
      where: { id: shipment.id },
      select: {
        id: true,
        status: true,
        courierProvider: true,
        trackingId: true,
        providerStatus: true,
        providerReference: true,
        lastReconciledAt: true,
        nextReconcileAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: result.outcome !== 'failed',
      outcome: result.outcome,
      detail: result.detail,
      // The provider's own status string is useful support context and carries no
      // customer data, so it is safe to return.
      providerStatus: updated?.providerStatus ?? null,
      provider: providerCode,
      providerName:
        listCourierProviders().find((entry) => entry.code === providerCode)?.name ?? providerCode,
      nextReconcileAt: updated?.nextReconcileAt?.toISOString() ?? null,
      shipment: updated,
    });
  } catch (error) {
    logger.error('Shipment sync failed.', {
      shipmentId: shipment.id,
      provider: providerCode,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    return courierErrorResponse(error, { operation: 'reconcileShipment', provider: providerCode });
  }
}
