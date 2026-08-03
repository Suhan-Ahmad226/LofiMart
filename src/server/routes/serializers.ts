import { redactSensitiveValue } from "../../features/shared/services/security/fieldEncryption.js";

function toPlainNumber(value: unknown) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value && "toNumber" in value && typeof (value as any).toNumber === "function") {
    return (value as any).toNumber();
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'Unknown error');
}

function getCustomerOrderActionState(order: any) {
  const normalizedOrderStatus = String(order?.status || "").toLowerCase();
  const shipments = Array.isArray(order?.shipments) ? order.shipments : [];
  const normalizedShipmentStatuses = shipments.map((shipment: any) => String(shipment?.status || "").toLowerCase());
  const hasLockedShipmentStatus = normalizedShipmentStatuses.some((status: string) => status !== "processing");
  const hasCourierFlow =
    Boolean(order?.courierProvider) ||
    Boolean(order?.trackingId) ||
    Boolean(order?.pickupRequestedAt) ||
    Boolean(order?.pickedUpAt) ||
    Boolean(order?.outForDeliveryAt) ||
    Boolean(order?.deliveredAt) ||
    shipments.some(
      (shipment: any) =>
        Boolean(shipment?.courierProvider) ||
        Boolean(shipment?.trackingId) ||
        Boolean(shipment?.pickupRequestedAt) ||
        Boolean(shipment?.pickedUpAt) ||
        Boolean(shipment?.outForDeliveryAt) ||
        Boolean(shipment?.deliveredAt),
    );
  const paymentStatus = String(order?.paymentStatus || "").toLowerCase();
  const paymentLocked = ["paid", "captured", "authorized"].includes(paymentStatus);

  if (normalizedOrderStatus === "cancelled") {
    return {
      canEdit: false,
      canCancel: false,
      blockReason: "This order has already been cancelled.",
    };
  }

  if (paymentLocked) {
    return {
      canEdit: false,
      canCancel: false,
      blockReason: "This order can no longer be changed after payment confirmation.",
    };
  }

  if (normalizedOrderStatus !== "processing" || hasLockedShipmentStatus || hasCourierFlow) {
    return {
      canEdit: false,
      canCancel: false,
      blockReason: "This order can only be changed before the seller accepts it or courier processing begins.",
    };
  }

  return {
    canEdit: true,
    canCancel: true,
    blockReason: null,
  };
}

function serializeResellerPayout(payout: any) {
  return {
    id: payout.id,
    reseller_id: payout.resellerId,
    amount: toPlainNumber(payout.amount),
    status: payout.status,
    notes: payout.notes ?? null,
    paid_at: payout.paidAt ? new Date(payout.paidAt).toISOString() : null,
    created_at: payout.createdAt ? new Date(payout.createdAt).toISOString() : undefined,
  };
}

function serializeAddress(address: any) {
  return {
    id: address.id,
    label: address.label ?? null,
    type: address.type ?? "shipping",
    name: address.name,
    phone: address.phone,
    alternate_phone: address.alternatePhone ?? null,
    address: address.address,
    line2: address.line2 ?? null,
    division: address.division ?? null,
    district: address.district ?? null,
    upazila: address.upazila ?? null,
    house: address.house ?? null,
    road: address.road ?? null,
    village: address.village ?? null,
    city: address.city,
    state: address.state ?? null,
    postal_code: address.postalCode ?? null,
    country: address.country ?? "Bangladesh",
    is_default: address.isDefault ? 1 : 0,
    created_at: address.createdAt ? new Date(address.createdAt).toISOString() : undefined,
  };
}

function serializeNotificationPreference(preference: any) {
  return {
    email_enabled: preference?.emailEnabled ?? true,
    sms_enabled: preference?.smsEnabled ?? false,
    order_updates: preference?.orderUpdates ?? true,
    marketing_opt_in: preference?.marketingOptIn ?? false,
    payout_alerts: preference?.payoutAlerts ?? true,
    security_alerts: preference?.securityAlerts ?? true,
  };
}

function serializeVerificationSubmission(submission: any) {
  if (!submission) return null;

  return {
    id: submission.id,
    role: submission.role,
    status: submission.status,
    document_type: submission.documentType,
    business_name: submission.businessName ?? null,
    business_license_url: submission.businessLicenseUrl ?? null,
    notes: submission.notes ?? null,
    rejection_reason: submission.rejectionReason ?? null,
    risk_score: submission.riskScore ?? 0,
    submitted_at: submission.submittedAt ? new Date(submission.submittedAt).toISOString() : undefined,
    reviewed_at: submission.reviewedAt ? new Date(submission.reviewedAt).toISOString() : null,
    reviewed_by: submission.reviewedBy
      ? { id: submission.reviewedBy.id, name: submission.reviewedBy.name, email: submission.reviewedBy.email }
      : null,
    documents: Array.isArray(submission.documents)
      ? submission.documents.map((document: any) => ({
          id: document.id,
          type: document.type,
          label: document.label,
          url: document.url,
          mime_type: document.mimeType ?? null,
          size_bytes: document.sizeBytes ?? null,
        }))
      : [],
  };
}

function serializePayoutMethod(method: any) {
  return {
    id: method.id,
    type: method.type,
    provider: method.provider,
    account_name: method.accountName ?? null,
    account_last4: method.accountLast4 ?? null,
    bank_account_masked: redactSensitiveValue(method.encryptedAccountNumber),
    mobile_number_masked: redactSensitiveValue(method.encryptedMobileNumber),
    is_default: method.isDefault,
    status: method.status,
    metadata: method.metadata ?? null,
    created_at: method.createdAt ? new Date(method.createdAt).toISOString() : undefined,
    updated_at: method.updatedAt ? new Date(method.updatedAt).toISOString() : undefined,
  };
}

function serializePayoutTransaction(transaction: any) {
  return {
    id: transaction.id,
    user_id: transaction.userId,
    payout_method_id: transaction.payoutMethodId ?? null,
    type: transaction.type,
    amount: toPlainNumber(transaction.amount),
    currency: transaction.currency,
    status: transaction.status,
    reference: transaction.reference ?? null,
    notes: transaction.notes ?? null,
    metadata: transaction.metadata ?? null,
    processed_at: transaction.processedAt ? new Date(transaction.processedAt).toISOString() : null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

function serializeAccountActionRequest(request: any) {
  return {
    id: request.id,
    order_id: request.orderId ?? null,
    type: request.type,
    status: request.status,
    reason: request.reason ?? null,
    resolution_note: request.resolutionNote ?? null,
    processed_at: request.processedAt ? new Date(request.processedAt).toISOString() : null,
    created_at: request.createdAt ? new Date(request.createdAt).toISOString() : undefined,
  };
}

function serializeRiskFlag(flag: any) {
  return {
    id: flag.id,
    severity: flag.severity,
    reason: flag.reason,
    notes: flag.notes ?? null,
    is_active: flag.isActive,
    resolved_at: flag.resolvedAt ? new Date(flag.resolvedAt).toISOString() : null,
    created_at: flag.createdAt ? new Date(flag.createdAt).toISOString() : undefined,
  };
}

function serializeOrder(order: any) {
  const orderControls = getCustomerOrderActionState(order);

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
    payment_intent_id: order.paymentIntentId ?? null,
    payment_status: order.paymentStatus ?? null,
    paid_at: order.paidAt ? new Date(order.paidAt).toISOString() : null,
    pickup_requested_at: order.pickupRequestedAt ? new Date(order.pickupRequestedAt).toISOString() : null,
    picked_up_at: order.pickedUpAt ? new Date(order.pickedUpAt).toISOString() : null,
    out_for_delivery_at: order.outForDeliveryAt ? new Date(order.outForDeliveryAt).toISOString() : null,
    delivered_at: order.deliveredAt ? new Date(order.deliveredAt).toISOString() : null,
    failure_reason: order.failureReason ?? null,
    delivery_failure_reason: order.deliveryFailureReason ?? null,
    ref_code: order.refCode ?? null,
    shipping_address: order.shippingAddress ?? null,
    shipment_metadata: order.shipmentMetadata ?? null,
    shipments: Array.isArray(order.shipments) ? order.shipments.map(serializeOrderShipment) : undefined,
    customer_email: order.user?.email ?? null,
    customer_phone: order.user?.phone ?? null,
    can_edit: orderControls.canEdit,
    can_cancel: orderControls.canCancel,
    customer_action_block_reason: orderControls.blockReason,
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : undefined,
    updated_at: order.updatedAt ? new Date(order.updatedAt).toISOString() : undefined,
    customer_name: order.user?.name ?? undefined,
  };
}

function serializeOrderShipment(shipment: any) {
  return {
    id: shipment.id,
    order_id: shipment.orderId,
    seller_id: shipment.sellerId,
    seller_name: shipment.seller?.name ?? null,
    seller_store_name: shipment.seller?.storeName ?? null,
    seller_email: shipment.seller?.email ?? null,
    seller_phone: shipment.seller?.phone ?? null,
    warehouse_id: shipment.warehouseId ?? null,
    warehouse_name: shipment.warehouse?.name ?? null,
    warehouse_city: shipment.warehouse?.city ?? null,
    status: shipment.status,
    total: toPlainNumber(shipment.total),
    item_count: shipment.itemCount,
    courier_provider: shipment.courierProvider ?? null,
    tracking_id: shipment.trackingId ?? null,
    pickup_requested_at: shipment.pickupRequestedAt ? new Date(shipment.pickupRequestedAt).toISOString() : null,
    picked_up_at: shipment.pickedUpAt ? new Date(shipment.pickedUpAt).toISOString() : null,
    out_for_delivery_at: shipment.outForDeliveryAt ? new Date(shipment.outForDeliveryAt).toISOString() : null,
    delivered_at: shipment.deliveredAt ? new Date(shipment.deliveredAt).toISOString() : null,
    delivery_failure_reason: shipment.deliveryFailureReason ?? null,
    shipment_metadata: shipment.shipmentMetadata ?? null,
    created_at: shipment.createdAt ? new Date(shipment.createdAt).toISOString() : undefined,
    updated_at: shipment.updatedAt ? new Date(shipment.updatedAt).toISOString() : undefined,
    items: Array.isArray(shipment.items)
      ? shipment.items.map((item: any) => ({
          id: item.id,
          order_item_id: item.orderItemId,
          product_id: item.productId,
          quantity: item.qty,
          price: toPlainNumber(item.price),
          name: item.product?.name ?? '',
          image: item.product?.image ?? null,
        }))
      : undefined,
  };
}

function serializeOrderItem(item: any) {
  return {
    id: item.id,
    order_id: item.orderId,
    product_id: item.productId,
    quantity: item.qty,
    price: toPlainNumber(item.price),
    variant_summary: item.variantSummary ?? null,
    sku: item.variantSku ?? item.product?.sku ?? null,
    name: item.product?.name ?? '',
    image: item.product?.image ?? null,
    seller_name: item.product?.seller?.name ?? null,
    seller_store_name: item.product?.seller?.storeName ?? null,
    seller_email: item.product?.seller?.email ?? null,
    seller_phone: item.product?.seller?.phone ?? null,
  };
}

export {
  toPlainNumber,
  getErrorMessage,
  getCustomerOrderActionState,
  serializeResellerPayout,
  serializeAddress,
  serializeNotificationPreference,
  serializeVerificationSubmission,
  serializePayoutMethod,
  serializePayoutTransaction,
  serializeAccountActionRequest,
  serializeRiskFlag,
  serializeOrder,
  serializeOrderShipment,
  serializeOrderItem,
};
