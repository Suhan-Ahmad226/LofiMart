export function normalizeCourierStatus(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');

  if (normalized === 'pending') return 'pickup_requested';
  if (normalized === 'in_review') return 'pickup_requested';

  const directMatches = new Set([
    'processing',
    'packed',
    'ready_for_pickup',
    'pickup_requested',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'delivery_failed',
    'returned',
    'cancelled',
  ]);

  if (directMatches.has(normalized)) {
    return normalized;
  }

  if (['order.created', 'order_created', 'created', 'pending'].includes(normalized)) return 'pending';
  if (['order.updated', 'order_updated', 'assigned_for_pickup', 'assigned_for_delivery'].includes(normalized)) return normalized.includes('delivery') ? 'out_for_delivery' : 'pickup_requested';
  if (['picked', 'pickedup', 'pickup_done'].includes(normalized)) return 'picked_up';
  if (['pickup.requested', 'pickup_requested', 'pickup_cancelled'].includes(normalized)) return 'pickup_requested';
  if (['pickup', 'pickup_event'].includes(normalized)) return 'picked_up';
  if (['sorting_hub', 'at_the_sorting_hub', 'received_at_last_mile_hub'].includes(normalized)) return 'in_transit';
  if (['transit', 'shipped', 'shipping'].includes(normalized)) return 'in_transit';
  if (['assigned_for_delivery'].includes(normalized)) return 'out_for_delivery';
  if (['failed_delivery', 'delivery_exception', 'failed'].includes(normalized)) return 'delivery_failed';
  if (['partial_delivery'].includes(normalized)) return 'delivered';
  if (['return', 'returned_to_merchant', 'return_in_transit', 'paid_return'].includes(normalized)) return 'returned';
  if (['on_hold', 'pickup_failed'].includes(normalized)) return 'delivery_failed';
  if (['in_review'].includes(normalized)) return 'pickup_requested';
  if (['delivered_approval_pending', 'partial_delivered_approval_pending'].includes(normalized)) return 'out_for_delivery';
  if (['partial_delivered'].includes(normalized)) return 'delivered';
  if (['cancelled_approval_pending'].includes(normalized)) return 'cancelled';
  if (['hold'].includes(normalized)) return 'delivery_failed';

  return null;
}

export function normalizePathaoShipmentStatus(eventValue: unknown, statusValue?: unknown) {
  const normalize = (value: unknown) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_")
      .replaceAll("-", "_")
      .replaceAll(".", "_");

  const eventKey = normalize(eventValue);
  const statusKey = normalize(statusValue);
  const candidates = [eventKey, statusKey].filter(Boolean);

  for (const candidate of candidates) {
    if (["pending", "in_review", "order_created", "order_updated"].includes(candidate)) return "pickup_requested";
    if (["pickup_requested", "assigned_for_pickup"].includes(candidate)) return "pickup_requested";
    if (["pickup", "picked_up", "pickedup", "pickup_done"].includes(candidate)) return "picked_up";
    if (["pickup_cancelled", "cancelled", "cancelled_approval_pending"].includes(candidate)) return "cancelled";
    if (["pickup_failed", "on_hold", "hold", "delivery_failed", "failed_delivery", "delivery_exception", "failed"].includes(candidate)) {
      return "delivery_failed";
    }
    if (["at_the_sorting_hub", "sorting_hub", "in_transit", "received_at_last_mile_hub", "transit", "shipping", "shipped"].includes(candidate)) {
      return "in_transit";
    }
    if (["assigned_for_delivery", "out_for_delivery"].includes(candidate)) return "out_for_delivery";
    if (["delivered", "delivered_approval_pending", "partial_delivery", "partial_delivered", "partial_delivered_approval_pending"].includes(candidate)) {
      return "delivered";
    }
    if (["return", "return_in_transit", "returned_to_merchant", "paid_return", "exchange"].includes(candidate)) return "returned";
  }

  return normalizeCourierStatus(statusValue ?? eventValue);
}

export function buildShipmentTimestampData(
  normalizedStatus: string | null | undefined,
  shipment: {
    pickupRequestedAt?: Date | null;
    pickedUpAt?: Date | null;
    outForDeliveryAt?: Date | null;
    deliveredAt?: Date | null;
  },
) {
  const timestampData: Record<string, unknown> = {};
  if (!normalizedStatus) {
    return timestampData;
  }

  if (normalizedStatus === "pickup_requested") timestampData.pickupRequestedAt = shipment.pickupRequestedAt ?? new Date();
  if (normalizedStatus === "picked_up") timestampData.pickedUpAt = shipment.pickedUpAt ?? new Date();
  if (normalizedStatus === "out_for_delivery") timestampData.outForDeliveryAt = shipment.outForDeliveryAt ?? new Date();
  if (normalizedStatus === "delivered") timestampData.deliveredAt = shipment.deliveredAt ?? new Date();
  if (normalizedStatus !== "delivery_failed") timestampData.deliveryFailureReason = null;

  return timestampData;
}

export function extractCourierWebhookDetails(payload: any) {
  const trackingId =
    (typeof payload?.tracking_id === 'string' && payload.tracking_id) ||
    (typeof payload?.trackingId === 'string' && payload.trackingId) ||
    (typeof payload?.tracking_code === 'string' && payload.tracking_code) ||
    (typeof payload?.trackingCode === 'string' && payload.trackingCode) ||
    (typeof payload?.consignment_id === 'string' && payload.consignment_id) ||
    (typeof payload?.consignmentId === 'string' && payload.consignmentId) ||
    null;

  const rawStatus =
    payload?.event ??
    payload?.status ??
    payload?.order_status ??
    payload?.delivery_status ??
    payload?.parcel_status ??
    payload?.order_status_slug ??
    null;

  const pathaoEvent =
    typeof payload?.event === "string"
      ? payload.event
      : null;
  const pathaoOrderStatus =
    typeof payload?.order_status_slug === "string"
      ? payload.order_status_slug
      : typeof payload?.order_status === "string"
        ? payload.order_status
        : typeof payload?.status === "string"
          ? payload.status
          : null;

  return {
    trackingId,
    consignmentId:
      (typeof payload?.consignment_id === 'string' && payload.consignment_id) ||
      (typeof payload?.consignment_id === 'number' && Number.isFinite(payload.consignment_id) ? String(payload.consignment_id) : null) ||
      (typeof payload?.consignmentId === 'string' && payload.consignmentId) ||
      (typeof payload?.consignmentId === 'number' && Number.isFinite(payload.consignmentId) ? String(payload.consignmentId) : null) ||
      null,
    invoice:
      (typeof payload?.invoice === 'string' && payload.invoice) ||
      (typeof payload?.merchant_order_id === 'string' && payload.merchant_order_id) ||
      (typeof payload?.merchantOrderId === 'string' && payload.merchantOrderId) ||
      null,
    normalizedStatus: normalizeCourierStatus(rawStatus),
    pathaoNormalizedStatus: normalizePathaoShipmentStatus(pathaoEvent, pathaoOrderStatus),
    pathaoEvent,
    pathaoOrderStatus,
    rawStatus,
  };
}
