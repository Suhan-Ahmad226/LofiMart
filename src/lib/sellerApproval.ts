export const SELLER_STATUSES = {
  draft: "draft",
  pending_review: "pending_review",
  under_review: "under_review",
  approved: "approved",
  rejected: "rejected",
  suspended: "suspended",
} as const;

export type SellerStatus = (typeof SELLER_STATUSES)[keyof typeof SELLER_STATUSES];

export const PRODUCT_STATUSES = {
  draft: "draft",
  published: "published",
} as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[keyof typeof PRODUCT_STATUSES];

export const SELLER_APPROVAL_REQUIREMENT_IDS = {
  email_verified: "email_verified",
  phone_verified: "phone_verified",
  store_info_completed: "store_info_completed",
  pickup_location_added: "pickup_location_added",
  kyc_submitted: "kyc_submitted",
  payout_method_added: "payout_method_added",
} as const;

export type SellerApprovalRequirementId =
  (typeof SELLER_APPROVAL_REQUIREMENT_IDS)[keyof typeof SELLER_APPROVAL_REQUIREMENT_IDS];

export type SellerApprovalRequirement = {
  id: SellerApprovalRequirementId;
  label: string;
  completed: boolean;
};

export type SellerApprovalCapability =
  | "product_publish"
  | "storefront_publish"
  | "receive_orders"
  | "payout_withdrawal"
  | "flash_sale_submission"
  | "courier_booking"
  | "marketplace_visibility";

const SELLER_STATUS_SET = new Set<string>(Object.values(SELLER_STATUSES));

export function normalizeSellerStatus(status: unknown): SellerStatus {
  const value = String(status || "").trim().toLowerCase();
  if (SELLER_STATUS_SET.has(value)) {
    return value as SellerStatus;
  }
  if (value === "active") {
    return SELLER_STATUSES.approved;
  }
  return SELLER_STATUSES.draft;
}

export function isSellerApproved(status: unknown) {
  return normalizeSellerStatus(status) === SELLER_STATUSES.approved;
}

export function sellerCanEditAndResubmit(status: unknown) {
  const normalized = normalizeSellerStatus(status);
  return normalized === SELLER_STATUSES.draft || normalized === SELLER_STATUSES.rejected;
}

export function getSellerStatusLabel(status: unknown) {
  return normalizeSellerStatus(status).replaceAll("_", " ");
}

export function getSellerStatusTone(status: unknown) {
  const normalized = normalizeSellerStatus(status);
  if (normalized === SELLER_STATUSES.approved) return "success";
  if (normalized === SELLER_STATUSES.rejected || normalized === SELLER_STATUSES.suspended) return "critical";
  if (normalized === SELLER_STATUSES.under_review || normalized === SELLER_STATUSES.pending_review) return "warning";
  return "neutral";
}

/**
 * A KYC submission is considered present once the seller has successfully
 * submitted it. `pending` is the normal initial review state created by the
 * KYC submission API; `under_review` and `approved` are also valid submitted
 * states. Rejected KYC is intentionally not considered complete.
 */
export function isKycSubmittedStatus(status: unknown) {
  return ["pending", "submitted", "under_review", "approved"].includes(
    String(status || "").trim().toLowerCase(),
  );
}

export function buildSellerApprovalRequirements(input: {
  emailVerified: boolean;
  phoneVerified: boolean;
  hasStoreInfo: boolean;
  hasPickupLocation: boolean;
  hasKycSubmission: boolean;
  hasPayoutMethod: boolean;
}): SellerApprovalRequirement[] {
  return [
    {
      id: SELLER_APPROVAL_REQUIREMENT_IDS.email_verified,
      label: "Email verified",
      completed: Boolean(input.emailVerified),
    },
    {
      id: SELLER_APPROVAL_REQUIREMENT_IDS.phone_verified,
      label: "Phone verified",
      completed: Boolean(input.phoneVerified),
    },
    {
      id: SELLER_APPROVAL_REQUIREMENT_IDS.store_info_completed,
      label: "Store info completed",
      completed: Boolean(input.hasStoreInfo),
    },
    {
      id: SELLER_APPROVAL_REQUIREMENT_IDS.pickup_location_added,
      label: "Pickup location added",
      completed: Boolean(input.hasPickupLocation),
    },
    {
      id: SELLER_APPROVAL_REQUIREMENT_IDS.kyc_submitted,
      label: "KYC submitted",
      completed: Boolean(input.hasKycSubmission),
    },
    {
      id: SELLER_APPROVAL_REQUIREMENT_IDS.payout_method_added,
      label: "Payout method added",
      completed: Boolean(input.hasPayoutMethod),
    },
  ];
}

export function getMissingSellerApprovalRequirements(requirements: SellerApprovalRequirement[]) {
  return requirements.filter((item) => !item.completed);
}

export function canSellerSubmitForReview(requirements: SellerApprovalRequirement[], status: unknown) {
  return sellerCanEditAndResubmit(status) && getMissingSellerApprovalRequirements(requirements).length === 0;
}

export function getSellerApprovalBlockedActionLabel(capability: SellerApprovalCapability) {
  const labels: Record<SellerApprovalCapability, string> = {
    product_publish: "publish products",
    storefront_publish: "publish your storefront",
    receive_orders: "receive orders",
    payout_withdrawal: "withdraw payouts",
    flash_sale_submission: "submit flash sale entries",
    courier_booking: "book courier pickups",
    marketplace_visibility: "appear publicly in the marketplace",
  };

  return labels[capability];
}

export function getSellerApprovalBlockedMessage(capability: SellerApprovalCapability, status: unknown) {
  const action = getSellerApprovalBlockedActionLabel(capability);
  const normalized = normalizeSellerStatus(status);

  if (normalized === SELLER_STATUSES.rejected) {
    return `Your seller account needs fixes before you can ${action}. Update the required information and submit again.`;
  }
  if (normalized === SELLER_STATUSES.suspended) {
    return `Your seller account is suspended. Contact an admin before you can ${action}.`;
  }
  if (normalized === SELLER_STATUSES.pending_review || normalized === SELLER_STATUSES.under_review) {
    return `Your seller account is still under admin review. You can complete setup, but you cannot ${action} yet.`;
  }

  return `Complete onboarding and admin approval before you can ${action}.`;
}
