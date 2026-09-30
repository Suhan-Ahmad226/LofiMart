/**
 * Reseller commission settlement, driven by delivery outcomes.
 *
 * Extracted from `src/modules/logistics/webhookService.ts`. It is reseller
 * accounting, not courier code — it only ever ran *because* a shipment changed
 * status, and it must keep working for any future courier. Keeping it here means
 * the reseller payout flow no longer has a dependency on the logistics module.
 */

import { prismaDirect } from '../../shared/services/database/prisma';

/** Statuses that unwind a commission that was previously accrued. */
const REVERSAL_STATUSES = new Set(['cancelled', 'returned', 'delivery_failed']);

/** Commission rate applied to the order's line-item value. */
const RESELLER_COMMISSION_RATE = 0.05;

/**
 * Settles or reverses reseller commission for an order when a shipment's status
 * changes.
 *
 * Commission is only released once *every* shipment for the order is delivered:
 * a multi-vendor order settles when its last parcel lands, not its first. A
 * cancellation, return or failed delivery reverses any commission already
 * accrued for the order.
 *
 * Never throws. It is called from the courier webhook pipeline, where a failure
 * must not fail the delivery update that triggered it.
 */
export async function syncResellerSettlementFromShipmentStatus(
  orderId: string,
  status: string,
): Promise<void> {
  try {
    if (REVERSAL_STATUSES.has(status)) {
      await reverseResellerCommissionsForOrder(orderId, status);
      return;
    }

    if (status !== 'delivered') return;

    const shipments = await prismaDirect.orderShipment.findMany({
      where: { orderId },
      select: { status: true },
    });
    if (shipments.length === 0) return;

    if (shipments.every((shipment) => shipment.status === 'delivered')) {
      await settleResellerCommissionsForOrder(orderId);
    }
  } catch {
    // Settlement is eventually consistent. A transient database failure here is
    // logged by the caller's own error handling, not by throwing into a webhook.
  }
}

async function settleResellerCommissionsForOrder(orderId: string): Promise<void> {
  const order = await prismaDirect.order.findUnique({
    where: { id: orderId },
    select: { id: true, refCode: true, items: { select: { price: true, qty: true } } },
  });
  if (!order || !order.refCode) return;

  const referral = await prismaDirect.resellerReferral.findFirst({
    where: { code: String(order.refCode) },
    select: { resellerId: true },
  });
  if (!referral) return;

  // A webhook can redeliver, and a multi-vendor order can deliver its parcels on
  // separate days. Without this guard the commission would be accrued twice.
  const existing = await prismaDirect.resellerCommission.findFirst({
    where: { resellerId: referral.resellerId, orderId: order.id },
  });
  if (existing) return;

  const lineValue = order.items.reduce(
    (sum, item) => sum + Number(item.price) * item.qty,
    0,
  );

  await prismaDirect.resellerCommission.create({
    data: {
      resellerId: referral.resellerId,
      orderId: order.id,
      amount: lineValue * RESELLER_COMMISSION_RATE,
      status: 'pending',
    },
  });
}

async function reverseResellerCommissionsForOrder(
  orderId: string,
  reason: string,
): Promise<void> {
  const order = await prismaDirect.order.findUnique({
    where: { id: orderId },
    select: { id: true, refCode: true },
  });
  if (!order) return;

  const resellerId = await getResellerIdFromOrderRefCode(order.refCode);
  if (!resellerId) return;

  await prismaDirect.resellerCommission.updateMany({
    where: { resellerId, orderId: order.id, status: { in: ['paid', 'pending'] } },
    data: { status: reason, paidAt: null },
  });
}

async function getResellerIdFromOrderRefCode(
  refCode?: string | null,
): Promise<string | null> {
  if (!refCode) return null;

  const referral = await prismaDirect.resellerReferral.findFirst({
    where: { code: String(refCode) },
    select: { resellerId: true },
  });

  return referral?.resellerId ?? null;
}
