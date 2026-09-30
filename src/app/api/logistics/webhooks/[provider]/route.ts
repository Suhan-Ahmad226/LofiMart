import { NextRequest, NextResponse } from 'next/server';
import { handleCourierWebhook } from '@/features/courier/services/webhookService';
import { getCourierProvider } from '@/features/courier/registry/providerRegistry';
import { isCourierError } from '@/features/courier/core/errors';
import { getShipmentStatusLabel } from '@/features/courier/core/status';
import { createNotification } from '@/features/shared/services/notifications/notificationService';
import { syncResellerSettlementFromShipmentStatus } from '@/features/reseller/services/resellerSettlement';
import { prisma } from '@/lib/server';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Courier webhook intake.
 *
 * This route is deliberately thin. Verification, replay protection, status
 * mapping and the append-only audit trail all live in `handleCourierWebhook`; the
 * only thing left here is the app-specific side effect of telling the customer
 * their parcel moved, plus choosing the HTTP status the courier will see.
 *
 * What that buys, concretely, versus doing this inline:
 *
 *  - a redelivered webhook no longer sends a *second* "your order is out for
 *    delivery" notification, because the side effect only runs on a real
 *    transition;
 *  - a late webhook can no longer drag a delivered parcel back to `picked_up`,
 *    because backwards transitions are rejected centrally;
 *  - the `pathao`-specific header handling and `pathaoLastStatusSlug` metadata
 *    this route used to carry are gone, because the provider adapter owns them.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const providerCode = String(provider || '').trim().toLowerCase();

  // Unknown provider is a 404, not a 400: the courier is being configured
  // against a URL this deployment does not serve.
  if (!getCourierProvider(providerCode)) {
    return NextResponse.json({ error: 'Unsupported courier provider' }, { status: 404 });
  }

  try {
    const result = await handleCourierWebhook(providerCode, request, {
      onStatusChanged: async ({ shipmentId, orderId, status }) => {
        const shipment = await prisma.orderShipment.findUnique({
          where: { id: shipmentId },
          select: {
            order: { select: { userId: true, tenantId: true } },
          },
        });

        const userId = shipment?.order?.userId;
        const tenantId = shipment?.order?.tenantId ?? null;

        if (userId) {
          await createNotification({
            userId,
            tenantId,
            type: 'order_update',
            title: 'Shipment tracking updated',
            message: `Your shipment is now ${getShipmentStatusLabel(status).toLowerCase()}.`,
            actionUrl: `/account/orders/${orderId}?shipment=${shipmentId}`,
            metadata: { orderId, shipmentId, status, courierProvider: providerCode },
          });
        }

        // Reseller payouts depend on the delivery outcome, so this has to run
        // whenever the status moves — including a redelivery-driven transition
        // being impossible by construction.
        await syncResellerSettlementFromShipmentStatus(orderId, status);
      },
    });

    // Everything below is an acknowledgement. The courier redelivers on a
    // non-2xx, and repeating an event we have already applied achieves nothing,
    // so a processed, duplicate, ignored or unmatched delivery all answer 202.
    return NextResponse.json(
      {
        accepted: true,
        outcome: result.outcome,
        shipmentId: result.shipmentId,
        status: result.status,
      },
      { status: 202 },
    );
  } catch (error) {
    if (isCourierError(error) && error.code === 'COURIER_WEBHOOK') {
      // Signature failure is answered 401 so the courier stops retrying a
      // delivery that was never going to be accepted.
      const invalidSignature = /signature/i.test(error.message);
      return NextResponse.json(
        { error: invalidSignature ? 'Invalid courier webhook signature' : 'Unreadable courier webhook' },
        { status: invalidSignature ? 401 : 400 },
      );
    }

    logger.error('Courier webhook processing failed.', {
      provider: providerCode,
      code: isCourierError(error) ? error.code : 'COURIER_UNKNOWN',
      reason: error instanceof Error ? error.message : 'Unknown error',
    });

    // 500 on purpose: the event was not recorded, so a redelivery is the correct
    // and only recovery.
    return NextResponse.json({ error: 'Failed to process courier webhook' }, { status: 500 });
  }
}
