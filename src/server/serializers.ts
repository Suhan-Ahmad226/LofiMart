import crypto from "crypto";
import { getServerEnv } from "../lib/env.js";
import {
  PRODUCT_STATUSES,
  SELLER_STATUSES,
  buildSellerApprovalRequirements,
  getMissingSellerApprovalRequirements,
  isSellerApproved,
  normalizeSellerStatus,
} from "../lib/sellerApproval.js";
import { redactSensitiveValue } from "../features/shared/services/security/fieldEncryption.js";
import { serializeOrderShipment, toPlainNumber } from "./routes/serializers.js";

export { serializeOrderShipment, toPlainNumber };

const env = getServerEnv();

const PERFORMANCE_ALERT_WINDOW_MS = 10 * 60 * 1000;
const PERFORMANCE_ALERT_MIN_POOR_EVENTS = 8;
const PERFORMANCE_ALERT_MIN_POOR_EVENTS_PER_ROUTE = 3;

function sanitizeAlphaNumeric(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function makeProductSkuPrefix(name?: string | null, category?: string | null) {
  const categoryToken = sanitizeAlphaNumeric(String(category || "")).slice(0, 3);
  if (categoryToken.length >= 2) {
    return categoryToken;
  }

  const words = String(name || "")
    .split(/\s+/)
    .map((word) => sanitizeAlphaNumeric(word))
    .filter(Boolean);
  const initials = words.map((word) => word[0]).join("").slice(0, 3);
  return (initials || categoryToken || "PRD").padEnd(3, "X");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'Unknown error');
}

function logServerError(context: string, error: unknown, meta?: Record<string, unknown>) {
  const message = getErrorMessage(error);
  if (meta && Object.keys(meta).length > 0) {
    console.error(`[server] ${context}: ${message}`, meta);
    return;
  }
  console.error(`[server] ${context}: ${message}`);
}

function isDatabaseUnavailableError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("max clients reached") ||
    message.includes("can't reach database server") ||
    message.includes("too many connections") ||
    message.includes("prismaclientinitializationerror") ||
    message.includes("connection pool timeout")
  );
}

function normalizeStorefrontSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStorefrontDomain(value?: string | null) {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function generateStorefrontDomainVerificationToken() {
  return `asb-${crypto.randomBytes(12).toString("hex")}`;
}

function buildStorefrontDomainVerificationPayload(domain?: string | null, token?: string | null, status?: string | null, verifiedAt?: Date | string | null) {
  const normalizedDomain = normalizeStorefrontDomain(domain);
  const normalizedToken = token ? String(token) : null;

  if (!normalizedDomain) {
    return {
      domain: null,
      status: "unverified",
      token: null,
      verified_at: null,
      records: [],
    };
  }

  return {
    domain: normalizedDomain,
    status: status || "pending",
    token: normalizedToken,
    verified_at: verifiedAt ? new Date(verifiedAt).toISOString() : null,
    records: [
      {
        type: "CNAME",
        host: normalizedDomain,
        value: "stores.lofimart.com",
        note: "Point your reseller or seller subdomain to the LofiMart storefront gateway.",
      },
      {
        type: "TXT",
        host: `_amarshop-challenge.${normalizedDomain}`,
        value: normalizedToken || "",
        note: "Use this verification token so LofiMart can confirm domain ownership.",
      },
    ],
  };
}

function extractHostnameFromRequestHost(host?: string | null) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .split(":")[0] || "";
}

function isPlatformHost(hostname: string) {
  const normalizedFrontend = normalizeStorefrontDomain(env.FRONTEND_URL);
  const frontendHost = normalizedFrontend ? extractHostnameFromRequestHost(normalizedFrontend) : "";

  return (
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    (frontendHost ? hostname === frontendHost : false)
  );
}

function serializeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? undefined,
    alternate_phone: user.alternatePhone ?? null,
    role: user.role,
    avatar_url: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    store_name: user.storeName ?? null,
    storefront_slug: user.storefrontSlug ?? null,
    storefront_banner_url: user.storefrontBannerUrl ?? null,
    storefront_headline: user.storefrontHeadline ?? null,
    storefront_accent_color: user.storefrontAccentColor ?? null,
    storefront_custom_domain: user.storefrontCustomDomain ?? null,
    storefront_published: Boolean(user.storefrontPublished ?? true),
    storefront_domain_status: user.storefrontDomainStatus ?? "unverified",
    storefront_domain_verification_token: user.storefrontDomainVerificationToken ?? null,
    storefront_domain_verified_at: user.storefrontDomainVerifiedAt ? new Date(user.storefrontDomainVerifiedAt).toISOString() : null,
    profile_visibility: user.profileVisibility ?? "private",
    response_time_hours: user.responseTimeHours ?? null,
    seller_status: normalizeSellerStatus(user.sellerStatus),
    submitted_for_review_at: user.submittedForReviewAt ? new Date(user.submittedForReviewAt).toISOString() : null,
    approved_at: user.approvedAt ? new Date(user.approvedAt).toISOString() : null,
    approved_by: user.approvedBy
      ? {
          id: user.approvedBy.id,
          name: user.approvedBy.name ?? null,
          email: user.approvedBy.email ?? null,
        }
      : null,
    rejection_reason: user.rejectionReason ?? null,
    suspension_reason: user.suspensionReason ?? null,
    tenantId: user.tenantId ?? null,
    points: user.points ?? 0,
    wallet_balance: toPlainNumber(user.walletBalance ?? 0),
    email_verified: user.emailVerified ? 1 : 0,
    email_verified_at: user.emailVerifiedAt ? new Date(user.emailVerifiedAt).toISOString() : undefined,
    phone_verified: user.phoneVerified ? 1 : 0,
    phone_verified_at: user.phoneVerifiedAt ? new Date(user.phoneVerifiedAt).toISOString() : undefined,
    two_factor_enabled: Boolean(user.twoFactorEnabled),
    is_blocked: Boolean(user.isBlocked),
    blocked_at: user.blockedAt ? new Date(user.blockedAt).toISOString() : null,
    blocked_reason: user.blockedReason ?? null,
    deactivated_at: user.deactivatedAt ? new Date(user.deactivatedAt).toISOString() : null,
    created_at: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
  };
}

function serializeCategory(category: any) {
  return {
    id: category.id,
    name: category.name,
    icon: category.icon ?? null,
  };
}

function serializeSubcategory(subcategory: any) {
  return {
    id: subcategory.id,
    category_id: subcategory.categoryId,
    name: subcategory.name,
    icon: subcategory.icon ?? null,
  };
}

function serializeSubsubcategory(subsubcategory: any) {
  return {
    id: subsubcategory.id,
    subcategory_id: subsubcategory.subcategoryId,
    name: subsubcategory.name,
  };
}

function serializeProduct(product: any) {
  return {
    id: product.id,
    sku: product.sku ?? null,
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    price: toPlainNumber(product.price),
    old_price: toPlainNumber(product.oldPrice ?? product.price),
    image: product.image ?? null,
    gallery_images: Array.isArray(product.galleryImages) ? product.galleryImages.filter((item: unknown) => typeof item === "string" && item.trim()) : [],
    video_url: product.videoUrl ?? null,
    model_3d: product.model3d ?? null,
    category: product.category ?? null,
    stock: product.stock,
    rating: product.rating ?? 0,
    reviews_count: product.reviewsCount ?? 0,
    variant_options: Array.isArray(product.variantOptions) ? product.variantOptions : [],
    specifications: Array.isArray(product.specifications) ? product.specifications : [],
    reseller_enabled: Boolean(product.resellerEnabled),
    reseller_base_price:
      product.resellerBasePrice === null || typeof product.resellerBasePrice === "undefined"
        ? null
        : toPlainNumber(product.resellerBasePrice),
    reseller_suggested_price:
      product.resellerSuggestedPrice === null || typeof product.resellerSuggestedPrice === "undefined"
        ? null
        : toPlainNumber(product.resellerSuggestedPrice),
    reseller_notes: product.resellerNotes ?? null,
    product_status: product.productStatus ?? PRODUCT_STATUSES.draft,
    is_published: (product.productStatus ?? PRODUCT_STATUSES.draft) === PRODUCT_STATUSES.published,
    seller_id: product.sellerId ?? null,
    seller_name: product.seller?.name ?? undefined,
    store_name: product.seller?.storeName ?? null,
    seller_rating:
      Array.isArray(product.seller?.products) && product.seller.products.length > 0
        ? Number(
            (
              product.seller.products.reduce((sum: number, entry: any) => sum + Number(entry.rating ?? 0), 0) /
              product.seller.products.length
            ).toFixed(1),
          )
        : null,
    response_time_hours: product.seller?.responseTimeHours ?? null,
    verification_badge: product.seller?.verificationSubmission?.status === "verified",
    created_at: product.createdAt ? new Date(product.createdAt).toISOString() : undefined,
    published_at: product.publishedAt ? new Date(product.publishedAt).toISOString() : null,
  };
}

function getPublicApprovedSellerWhere() {
  return {
    role: "seller",
    sellerStatus: SELLER_STATUSES.approved,
    storefrontPublished: true,
    profileVisibility: { not: "private" as const },
  };
}

function getPublicPublishedProductWhere(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    productStatus: PRODUCT_STATUSES.published,
    seller: getPublicApprovedSellerWhere(),
  };
}

function buildSellerApprovalRequirementState(input: {
  seller: {
    emailVerified?: boolean | null;
    phoneVerified?: boolean | null;
    storeName?: string | null;
    storefrontSlug?: string | null;
    bio?: string | null;
    storefrontHeadline?: string | null;
  };
  verificationSubmission?: { status?: string | null } | null;
  payoutMethodCount: number;
  warehouses: Array<{
    address?: string | null;
    city?: string | null;
    phone?: string | null;
    contactName?: string | null;
  }>;
}) {
  const hasStoreIdentity = Boolean(input.seller.storeName?.trim()) && Boolean(input.seller.storefrontSlug?.trim());
  const hasStoreStory = Boolean(input.seller.bio?.trim()) || Boolean(input.seller.storefrontHeadline?.trim());
  const pickupReady = input.warehouses.some(
    (warehouse) =>
      Boolean(warehouse.address?.trim()) &&
      Boolean(warehouse.city?.trim()) &&
      Boolean(warehouse.phone?.trim()) &&
      Boolean(warehouse.contactName?.trim()),
  );
  const requirements = buildSellerApprovalRequirements({
    emailVerified: Boolean(input.seller.emailVerified),
    phoneVerified: Boolean(input.seller.phoneVerified),
    hasStoreInfo: hasStoreIdentity && hasStoreStory,
    hasPickupLocation: pickupReady,
    hasKycSubmission: Boolean(input.verificationSubmission),
    hasPayoutMethod: input.payoutMethodCount > 0,
  });

  return {
    hasStoreIdentity,
    hasStoreStory,
    pickupReady,
    requirements,
    missingRequirements: getMissingSellerApprovalRequirements(requirements),
  };
}

function canPublishSellerProduct(sellerStatus: unknown) {
  return isSellerApproved(sellerStatus);
}

function normalizeGalleryImages(input: any) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function serializeHomeSeller(seller: any) {
  const products = Array.isArray(seller.products) ? seller.products : [];
  const totalReviews = products.reduce((sum: number, product: any) => sum + Number(product.reviewsCount ?? 0), 0);
  const averageRating =
    products.length > 0
      ? Number(
          (
            products.reduce((sum: number, product: any) => sum + Number(product.rating ?? 0), 0) / products.length
          ).toFixed(1),
        )
      : 0;

  return {
    seller_id: seller.id,
    seller_name: seller.name ?? "Seller",
    store_name: seller.storeName ?? seller.name ?? "Store",
    slug: seller.storefrontSlug ?? null,
    banner_url: seller.storefrontBannerUrl ?? null,
    headline: seller.storefrontHeadline ?? seller.bio ?? null,
    avatar_url: seller.avatarUrl ?? null,
    response_time_hours: seller.responseTimeHours ?? null,
    verification_badge: seller.verificationSubmission?.status === "verified",
    product_count: products.length,
    average_rating: averageRating,
    review_count: totalReviews,
  };
}

function normalizeSpecifications(input: any) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item: any) => ({
      label: String(item?.label || "").trim(),
      value: String(item?.value || "").trim(),
    }))
    .filter((item: any) => item.label && item.value);
}

function serializePosOrder(order: any) {
  return {
    id: order.id,
    order_code: order.orderCode ?? null,
    total: toPlainNumber(order.total),
    payment_method: order.paymentMethod ?? "cash",
    payment_status: order.paymentStatus ?? "paid",
    customer_name:
      (order.shippingAddress && typeof order.shippingAddress === "object"
        ? (order.shippingAddress as Record<string, any>).name
        : null) ?? "Walk-in Customer",
    customer_phone:
      (order.shippingAddress && typeof order.shippingAddress === "object"
        ? (order.shippingAddress as Record<string, any>).phone
        : null) ?? null,
    created_at: order.createdAt ? new Date(order.createdAt).toISOString() : undefined,
    items: Array.isArray(order.items)
      ? order.items.map((item: any) => ({
          id: item.id,
          qty: Number(item.qty),
          price: toPlainNumber(item.price),
          line_total: Number(item.qty) * Number(toPlainNumber(item.price) ?? 0),
          product_name: item.product?.name ?? "Product",
        }))
      : [],
  };
}

function normalizeVariantOptions(input: any) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((option: any) => ({
      name: String(option?.name || '').trim(),
      values: Array.isArray(option?.values)
        ? option.values
            .map((value: any) => {
              if (typeof value === "string") {
                const label = String(value || "").trim();
                return label ? { label, price_adjustment: 0, stock_override: null } : null;
              }

              const label = String(value?.label || "").trim();
              if (!label) {
                return null;
              }

              const priceAdjustment = Number(value?.price_adjustment ?? value?.priceAdjustment ?? 0);
              const rawStockOverride = value?.stock_override ?? value?.stockOverride;
              const stockOverride =
                rawStockOverride === null || rawStockOverride === "" || typeof rawStockOverride === "undefined"
                  ? null
                  : Number(rawStockOverride);

              return {
                label,
                price_adjustment: Number.isFinite(priceAdjustment) ? priceAdjustment : 0,
                stock_override: stockOverride !== null && Number.isFinite(stockOverride) ? Math.max(0, Math.floor(stockOverride)) : null,
                sku_suffix: String(value?.sku_suffix ?? value?.skuSuffix ?? "").trim().toUpperCase() || null,
              };
            })
            .filter(Boolean)
        : [],
    }))
    .filter((option: any) => option.name && option.values.length > 0);
}

function serializeReview(review: any) {
  return {
    id: review.id,
    product_id: review.productId,
    user_id: review.userId,
    rating: review.rating,
    comment: review.comment ?? "",
    created_at: review.createdAt ? new Date(review.createdAt).toISOString() : undefined,
    user_name: review.user?.name ?? "Anonymous",
  };
}

function serializeBlogPost(post: any) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? '',
    category: post.category ?? '',
    content: post.content,
    image: post.image ?? '',
    seo_title: post.seoTitle ?? '',
    seo_description: post.seoDescription ?? '',
    author_id: post.authorId,
    author_name: post.author?.name ?? '',
    created_at: post.createdAt ? new Date(post.createdAt).toISOString() : undefined,
    updated_at: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
  };
}

function serializeContactMessage(message: any) {
  return {
    id: message.id,
    name: message.name,
    email: message.email,
    subject: message.subject,
    message: message.message,
    status: message.status,
    created_at: message.createdAt ? new Date(message.createdAt).toISOString() : undefined,
    updated_at: message.updatedAt ? new Date(message.updatedAt).toISOString() : undefined,
  };
}

function serializeBanner(banner: any) {
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle ?? '',
    image: banner.image,
    link: banner.link,
    button_text: banner.buttonText,
    is_active: banner.isActive ? 1 : 0,
    created_at: banner.createdAt ? new Date(banner.createdAt).toISOString() : undefined,
    updated_at: banner.updatedAt ? new Date(banner.updatedAt).toISOString() : undefined,
  };
}

function serializeResellerMarkup(markup: any) {
  const basePrice = Number(toPlainNumber(markup.product?.resellerBasePrice ?? markup.product?.price ?? 0) || 0);
  const markupAmount = Number(toPlainNumber(markup.markupAmount) || 0);
  return {
    id: markup.id,
    reseller_id: markup.resellerId,
    product_id: markup.productId,
    markup_amount: markupAmount,
    reseller_base_price: basePrice,
    reseller_sale_price: Number((basePrice + markupAmount).toFixed(2)),
    created_at: markup.createdAt ? new Date(markup.createdAt).toISOString() : undefined,
    updated_at: markup.updatedAt ? new Date(markup.updatedAt).toISOString() : undefined,
    product: markup.product ? serializeProduct(markup.product) : undefined,
  };
}

function serializeCoupon(coupon: any) {
  return {
    id: coupon.id,
    code: coupon.code,
    seller_id: coupon.sellerId ?? null,
    seller_name: coupon.seller?.storeName ?? coupon.seller?.name ?? null,
    discount_type: coupon.discountType,
    discount_value: toPlainNumber(coupon.discountValue),
    min_order_value: toPlainNumber(coupon.minOrderValue),
    expiry_date: coupon.expiryDate.toISOString(),
    created_at: coupon.createdAt ? new Date(coupon.createdAt).toISOString() : undefined,
  };
}

function serializeResellerCommission(commission: any) {
  return {
    id: commission.id,
    reseller_id: commission.resellerId,
    order_id: commission.orderId ?? null,
    product_id: commission.productId ?? null,
    amount: toPlainNumber(commission.amount),
    status: commission.status,
    product_name: commission.product?.name ?? null,
    paid_at: commission.paidAt ? new Date(commission.paidAt).toISOString() : null,
    created_at: commission.createdAt ? new Date(commission.createdAt).toISOString() : undefined,
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

function buildFlashSaleSlug(value: unknown) {
  const base = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || `flash-sale-${Date.now()}`;
}

function serializeFlashSaleEntry(entry: any) {
  return {
    id: entry.id,
    campaign_id: entry.campaignId,
    seller_id: entry.sellerId,
    product_id: entry.productId,
    sale_price: toPlainNumber(entry.salePrice),
    allocated_stock: entry.allocatedStock ?? 0,
    status: entry.status,
    note: entry.note ?? null,
    rejection_reason: entry.rejectionReason ?? null,
    reviewed_at: entry.reviewedAt ? new Date(entry.reviewedAt).toISOString() : null,
    created_at: entry.createdAt ? new Date(entry.createdAt).toISOString() : undefined,
    updated_at: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : undefined,
    seller_name: entry.seller?.name ?? null,
    reviewed_by_name: entry.reviewedBy?.name ?? null,
    product: entry.product ? serializeProduct(entry.product) : null,
  };
}

function serializeFlashSaleCampaign(campaign: any) {
  return {
    id: campaign.id,
    title: campaign.title,
    slug: campaign.slug,
    description: campaign.description ?? "",
    banner_image: campaign.bannerImage ?? "",
    starts_at: campaign.startsAt ? new Date(campaign.startsAt).toISOString() : undefined,
    ends_at: campaign.endsAt ? new Date(campaign.endsAt).toISOString() : undefined,
    status: campaign.status,
    created_by_id: campaign.createdById ?? null,
    created_by_name: campaign.createdBy?.name ?? null,
    created_at: campaign.createdAt ? new Date(campaign.createdAt).toISOString() : undefined,
    updated_at: campaign.updatedAt ? new Date(campaign.updatedAt).toISOString() : undefined,
    entries: Array.isArray(campaign.entries) ? campaign.entries.map(serializeFlashSaleEntry) : undefined,
  };
}

function isCriticalPerformanceBurst(events: any[], route: string, now: number) {
  const recentPoorEvents = events.filter((entry) =>
    entry &&
    entry.rating === "poor" &&
    typeof entry.ts === "number" &&
    entry.ts >= now - PERFORMANCE_ALERT_WINDOW_MS,
  );

  if (recentPoorEvents.length >= PERFORMANCE_ALERT_MIN_POOR_EVENTS) {
    return {
      triggered: true,
      recentPoorCount: recentPoorEvents.length,
      routePoorCount: recentPoorEvents.filter((entry) => entry.route === route).length,
    };
  }

  const routePoorCount = recentPoorEvents.filter((entry) => entry.route === route).length;

  return {
    triggered: routePoorCount >= PERFORMANCE_ALERT_MIN_POOR_EVENTS_PER_ROUTE,
    recentPoorCount: recentPoorEvents.length,
    routePoorCount,
  };
}

function normalizeCourierStatus(value: unknown) {
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

function normalizePathaoShipmentStatus(eventValue: unknown, statusValue?: unknown) {
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

function buildShipmentTimestampData(
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

function extractCourierWebhookDetails(payload: any) {
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

function normalizeBangladeshPhone(phone: string | null | undefined) {
  const raw = String(phone || '').replace(/\D+/g, '');
  if (raw.length === 11) return raw;
  if (raw.length === 13 && raw.startsWith('880')) return `0${raw.slice(3)}`;
  return '';
}

function formatCommunityRole(role: string | null | undefined) {
  switch ((role || "").toLowerCase()) {
    case "seller":
      return "Community Seller";
    case "reseller":
      return "Verified Reseller";
    case "admin":
      return "Team Curator";
    default:
      return "Verified Buyer";
  }
}

function buildCommunityTopic(category: string | null | undefined) {
  const normalized = (category || "Community Picks").trim();
  const compact = normalized.replace(/[^a-zA-Z0-9 ]+/g, " ").trim();
  const words = compact.split(/\s+/).filter(Boolean).slice(0, 2);
  return `#${words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("") || "CommunityPicks"}`;
}

function serializeCommunityFeedItem(review: any) {
  const rating = Number(review.rating ?? 0);
  const reviewsCount = Number(review.product?.reviewsCount ?? 0);
  const likes = Math.max(18, reviewsCount * 7 + rating * 9);
  const comments = Math.max(3, Math.min(28, Math.round(reviewsCount / 2) + Math.max(rating - 2, 0)));
  const saves = Math.max(6, Math.round(likes / 3));
  const role = review.user?.role ?? "customer";
  const tab =
    role === "reseller"
      ? "Reseller Picks"
      : rating >= 5
        ? "Trending"
        : "Reviews";
  const caption =
    (review.comment && String(review.comment).trim()) ||
    `Shared a ${rating >= 4 ? "strong" : "helpful"} review after buying ${review.product?.name ?? "this product"}.`;

  return {
    id: review.id,
    user: {
      name: review.user?.name ?? "Anonymous Shopper",
      avatar: (review.user?.name ?? "A").trim().charAt(0).toUpperCase() || "A",
      role: formatCommunityRole(role),
      badge: rating >= 5 ? "Verified purchase review" : "Community product feedback",
    },
    image: review.product?.image || "",
    caption,
    likes,
    comments,
    saves,
    tab,
    topic: buildCommunityTopic(review.product?.category),
    created_at: review.createdAt ? new Date(review.createdAt).toISOString() : new Date().toISOString(),
    product: {
      name: review.product?.name ?? "Featured product",
      price: `BDT ${toPlainNumber(review.product?.price ?? 0)}`,
      category: review.product?.category ?? "General",
      slug: review.product?.slug ?? "",
    },
  };
}

function serializeCommunityContributor(user: any) {
  const role = user.role === "reseller" ? "Verified Reseller" : "Community Seller";
  const productCount = user._count?.products ?? 0;
  const reviewCount = user.products?.reduce((sum: number, product: any) => sum + Number(product.reviewsCount ?? 0), 0) ?? 0;

  return {
    id: user.id,
    name: user.name,
    role,
    stat: productCount > 0 ? `${productCount} active products` : `${Math.max(reviewCount, 1)} verified reviews`,
  };
}

function serializeCommunityTopic(topic: { tag: string; posts: number }) {
  return {
    label: topic.tag,
    note: `${topic.posts.toLocaleString()} posts this week`,
  };
}

function serializeCommunityPost(post: any, currentUserId?: string | null) {
  const likeSet = Array.isArray(post.likes) ? post.likes : [];
  const visibleComments = Array.isArray(post.comments)
    ? post.comments.filter((comment: any) => comment.status === "visible")
    : [];
  const role = post.user?.role ?? "customer";
  const reviewsCount = Number(post.product?.reviewsCount ?? 0);

  return {
    id: post.id,
    user: {
      id: post.user?.id ?? null,
      name: post.user?.name ?? "Community member",
      avatar: (post.user?.name ?? "A").trim().charAt(0).toUpperCase() || "A",
      role: formatCommunityRole(role),
      badge: role === "reseller" || role === "seller" ? "Verified seller partner" : "Verified community member",
    },
    image: post.imageUrl || post.product?.image || "",
    caption: post.content,
    title: post.title ?? "",
    likes: Number(post.likesCount ?? likeSet.length ?? 0),
    comments: Number(post.commentsCount ?? visibleComments.length ?? 0),
    saves: Math.max(6, Math.round((Number(post.likesCount ?? 0) + Number(post.commentsCount ?? 0) + reviewsCount) / 2.4)),
    tab: role === "reseller" ? "Reseller Picks" : reviewsCount >= 8 || Number(post.likesCount ?? 0) >= 20 ? "Trending" : "Reviews",
    topic: post.topic || buildCommunityTopic(post.product?.category),
    created_at: post.createdAt ? new Date(post.createdAt).toISOString() : new Date().toISOString(),
    product: {
      name: post.product?.name ?? "Community feature",
      price: `BDT ${toPlainNumber(post.product?.price ?? 0)}`,
      category: post.product?.category ?? "General",
      slug: post.product?.slug ?? "",
    },
    liked_by_me: currentUserId ? likeSet.some((like: any) => like.userId === currentUserId) : false,
    status: post.status,
  };
}

function serializeCommunityComment(comment: any) {
  return {
    id: comment.id,
    content: comment.content,
    status: comment.status,
    created_at: comment.createdAt ? new Date(comment.createdAt).toISOString() : new Date().toISOString(),
    user: {
      id: comment.user?.id ?? null,
      name: comment.user?.name ?? "Community member",
      avatar: (comment.user?.name ?? "A").trim().charAt(0).toUpperCase() || "A",
      role: formatCommunityRole(comment.user?.role),
    },
  };
}

function serializeCommunityReport(report: any) {
  return {
    id: report.id,
    post_id: report.postId,
    reason: report.reason,
    details: report.details ?? null,
    status: report.status,
    created_at: report.createdAt ? new Date(report.createdAt).toISOString() : new Date().toISOString(),
    user: {
      id: report.user?.id ?? null,
      name: report.user?.name ?? "Community member",
      role: formatCommunityRole(report.user?.role),
    },
    post_excerpt: report.post?.content?.slice(0, 120) ?? "",
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

function serializeLoginActivity(activity: any) {
  return {
    id: activity.id,
    session_id: activity.sessionId,
    ip_address: activity.ipAddress ?? null,
    user_agent: activity.userAgent ?? null,
    device_name: activity.deviceName ?? null,
    location: activity.location ?? null,
    logged_in_at: activity.loggedInAt ? new Date(activity.loggedInAt).toISOString() : undefined,
    last_seen_at: activity.lastSeenAt ? new Date(activity.lastSeenAt).toISOString() : undefined,
    revoked_at: activity.revokedAt ? new Date(activity.revokedAt).toISOString() : null,
  };
}

function serializeWalletTransaction(transaction: any) {
  return {
    id: transaction.id,
    type: transaction.type,
    amount: toPlainNumber(transaction.amount),
    currency: transaction.currency,
    status: transaction.status,
    source: transaction.source,
    description: transaction.description,
    balance_after: toPlainNumber(transaction.balanceAfter ?? 0),
    metadata: transaction.metadata ?? null,
    created_at: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
  };
}

function serializeRewardLog(log: any) {
  return {
    id: log.id,
    event_type: log.eventType,
    coins_amount: log.coinsAmount ?? 0,
    wallet_amount: toPlainNumber(log.walletAmount ?? 0),
    discount_amount: toPlainNumber(log.discountAmount ?? 0),
    source: log.source,
    description: log.description,
    reference_id: log.referenceId ?? null,
    metadata: log.metadata ?? null,
    created_at: log.createdAt ? new Date(log.createdAt).toISOString() : undefined,
  };
}

function serializeReferralCode(code: any) {
  return {
    id: code.id,
    code: code.code,
    clicks: code.clicks ?? 0,
    successful_referrals: code.successfulReferrals ?? 0,
    earnings: toPlainNumber(code.earnings ?? 0),
    created_at: code.createdAt ? new Date(code.createdAt).toISOString() : undefined,
    updated_at: code.updatedAt ? new Date(code.updatedAt).toISOString() : undefined,
  };
}

function serializeReferralAttribution(attribution: any) {
  return {
    id: attribution.id,
    invitee_email: attribution.inviteeEmail ?? null,
    status: attribution.status,
    reward_granted_at: attribution.rewardGrantedAt ? new Date(attribution.rewardGrantedAt).toISOString() : null,
    created_at: attribution.createdAt ? new Date(attribution.createdAt).toISOString() : undefined,
    invitee: attribution.invitee ? serializeUser(attribution.invitee) : null,
  };
}

function serializeLoginStreak(streak: any) {
  return {
    current_streak: streak?.currentStreak ?? 0,
    longest_streak: streak?.longestStreak ?? 0,
    total_claimed_coins: streak?.totalClaimedCoins ?? 0,
    last_claimed_on: streak?.lastClaimedOn ? new Date(streak.lastClaimedOn).toISOString() : null,
  };
}

function serializeSpinReward(reward: any) {
  return {
    id: reward.id,
    label: reward.label,
    reward_type: reward.rewardType,
    reward_value: toPlainNumber(reward.rewardValue),
    probability: reward.probability,
    is_active: reward.isActive,
    display_order: reward.displayOrder,
  };
}

function serializeSpinHistory(history: any) {
  return {
    id: history.id,
    reward_label: history.rewardLabel,
    reward_type: history.rewardType,
    reward_value: toPlainNumber(history.rewardValue),
    date_key: history.dateKey,
    created_at: history.createdAt ? new Date(history.createdAt).toISOString() : undefined,
  };
}

function serializeMissionProgress(progress: any) {
  return {
    id: progress.id,
    progress: progress.progress,
    completed_at: progress.completedAt ? new Date(progress.completedAt).toISOString() : null,
    claimed_at: progress.claimedAt ? new Date(progress.claimedAt).toISOString() : null,
    mission: progress.mission
      ? {
          id: progress.mission.id,
          key: progress.mission.key,
          title: progress.mission.title,
          description: progress.mission.description,
          target_count: progress.mission.targetCount,
          reward_coins: progress.mission.rewardCoins,
          reward_wallet: toPlainNumber(progress.mission.rewardWallet),
        }
      : null,
  };
}

function serializeTenantSetting(setting: any) {
  if (!setting) return null;

  return {
    tenant_id: setting.tenantId,
    currency: setting.currency,
    locale: setting.locale,
    free_shipping_threshold: toPlainNumber(setting.freeShippingThreshold),
    cart_recovery_delay_mins: setting.cartRecoveryDelayMins,
    signup_bonus_coins: setting.signupBonusCoins,
    daily_login_base_coins: setting.dailyLoginBaseCoins,
    daily_login_max_coins: setting.dailyLoginMaxCoins,
    order_cashback_bps: setting.orderCashbackBps,
    referral_inviter_coins: setting.referralInviterCoins,
    referral_invitee_coins: setting.referralInviteeCoins,
    surprise_reward_chance: setting.surpriseRewardChance,
    spin_enabled: setting.spinEnabled,
    spin_daily_limit: setting.spinDailyLimit,
  };
}

function serializeUserNotification(notification: any) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    action_url: notification.actionUrl ?? null,
    metadata: notification.metadata ?? null,
    read_at: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    created_at: notification.createdAt ? new Date(notification.createdAt).toISOString() : undefined,
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

function buildEditableCartItemsFromOrder(order: any, products: any[]) {
  const productMap = new Map(products.map((product) => [String(product.id), product]));

  return Array.isArray(order?.items)
    ? order.items
        .map((item: any) => {
          const product = productMap.get(String(item.productId));
          if (!product) return null;

          const selectedVariantKey = item.variantSku || item.variantSummary || "";

          return {
            id: product.id,
            sku: item.variantSku ?? product.sku ?? null,
            name: product.name,
            slug: product.slug,
            description: product.description ?? "",
            price: toPlainNumber(item.price),
            old_price: toPlainNumber(product.oldPrice ?? item.price),
            image: product.image ?? null,
            gallery_images: Array.isArray(product.galleryImages) ? product.galleryImages : [],
            video_url: product.videoUrl ?? null,
            model_3d: product.model3d ?? null,
            category: product.category ?? "",
            stock: Number(product.stock ?? 0),
            rating: Number(product.rating ?? 0),
            reviews_count: Number(product.reviewsCount ?? 0),
            variant_options: Array.isArray(product.variantOptions) ? product.variantOptions : [],
            specifications: Array.isArray(product.specifications) ? product.specifications : [],
            reseller_enabled: Boolean(product.resellerEnabled),
            reseller_base_price:
              product.resellerBasePrice === null || typeof product.resellerBasePrice === "undefined"
                ? null
                : toPlainNumber(product.resellerBasePrice),
            reseller_suggested_price:
              product.resellerSuggestedPrice === null || typeof product.resellerSuggestedPrice === "undefined"
                ? null
                : toPlainNumber(product.resellerSuggestedPrice),
            reseller_notes: product.resellerNotes ?? null,
            seller_id: product.sellerId ?? null,
            seller_name: product.seller?.name ?? undefined,
            store_name: product.seller?.storeName ?? null,
            seller_rating:
              Array.isArray(product.seller?.products) && product.seller.products.length > 0
                ? Number(
                    (
                      product.seller.products.reduce((sum: number, entry: any) => sum + Number(entry.rating ?? 0), 0) /
                      product.seller.products.length
                    ).toFixed(1),
                  )
                : null,
            response_time_hours: product.seller?.responseTimeHours ?? null,
            verification_badge: product.seller?.verificationSubmission?.status === "verified",
            selected_variant_key: selectedVariantKey,
            selected_variant_summary: item.variantSummary ?? null,
            selected_variant_sku: item.variantSku ?? null,
            quantity: Number(item.qty ?? 1),
          };
        })
        .filter(Boolean)
    : [];
}

function buildHourlySeriesFromOrders(orders: Array<{ createdAt: Date; total?: unknown }>, hours = 12) {
  const now = new Date();
  const buckets = Array.from({ length: hours }, (_, index) => {
    const bucketDate = new Date(now.getTime() - (hours - 1 - index) * 60 * 60 * 1000);
    return {
      label: `${bucketDate.getHours()}:00`,
      key: `${bucketDate.getFullYear()}-${bucketDate.getMonth()}-${bucketDate.getDate()}-${bucketDate.getHours()}`,
      revenue: 0,
      orders: 0,
    };
  });

  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}-${createdAt.getHours()}`;
    const bucket = bucketMap.get(key);
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.revenue += Number(order.total ?? 0);
  }

  return buckets.map(({ key, ...bucket }) => bucket);
}

function buildWeeklyHeatmapFromOrders(orders: Array<{ createdAt: Date }>) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const matrix = Array.from({ length: 7 }, (_, dayIndex) => ({
    day: days[dayIndex],
    hours: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
  }));

  for (const order of orders) {
    const createdAt = new Date(order.createdAt);
    const dayBucket = matrix[createdAt.getDay()];
    if (!dayBucket) continue;
    const hourBucket = dayBucket.hours[createdAt.getHours()];
    if (!hourBucket) continue;
    hourBucket.count += 1;
  }

  return matrix;
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

function serializeManualOrderCatalogProduct(product: any) {
  return {
    ...serializeProduct(product),
    inventory_items: Array.isArray(product.inventoryItems)
      ? product.inventoryItems.map((inventoryItem: any) => ({
          id: inventoryItem.id,
          warehouse_id: inventoryItem.warehouseId,
          warehouse_name: inventoryItem.warehouse?.name ?? null,
          quantity: Number(inventoryItem.quantity ?? 0),
        }))
      : [],
  };
}

export {
  sanitizeAlphaNumeric,
  makeProductSkuPrefix,
  getErrorMessage,
  logServerError,
  isDatabaseUnavailableError,
  normalizeStorefrontSlug,
  normalizeStorefrontDomain,
  generateStorefrontDomainVerificationToken,
  buildStorefrontDomainVerificationPayload,
  extractHostnameFromRequestHost,
  isPlatformHost,
  serializeUser,
  serializeCategory,
  serializeSubcategory,
  serializeSubsubcategory,
  serializeProduct,
  getPublicApprovedSellerWhere,
  getPublicPublishedProductWhere,
  buildSellerApprovalRequirementState,
  canPublishSellerProduct,
  normalizeGalleryImages,
  serializeHomeSeller,
  normalizeSpecifications,
  serializePosOrder,
  normalizeVariantOptions,
  serializeReview,
  serializeBlogPost,
  serializeContactMessage,
  serializeBanner,
  serializeResellerMarkup,
  serializeCoupon,
  serializeResellerCommission,
  serializeResellerPayout,
  serializeAddress,
  buildFlashSaleSlug,
  serializeFlashSaleEntry,
  serializeFlashSaleCampaign,
  isCriticalPerformanceBurst,
  normalizeCourierStatus,
  normalizePathaoShipmentStatus,
  buildShipmentTimestampData,
  extractCourierWebhookDetails,
  normalizeBangladeshPhone,
  formatCommunityRole,
  buildCommunityTopic,
  serializeCommunityFeedItem,
  serializeCommunityContributor,
  serializeCommunityTopic,
  serializeCommunityPost,
  serializeCommunityComment,
  serializeCommunityReport,
  serializeNotificationPreference,
  serializeVerificationSubmission,
  serializePayoutMethod,
  serializePayoutTransaction,
  serializeLoginActivity,
  serializeWalletTransaction,
  serializeRewardLog,
  serializeReferralCode,
  serializeReferralAttribution,
  serializeLoginStreak,
  serializeSpinReward,
  serializeSpinHistory,
  serializeMissionProgress,
  serializeTenantSetting,
  serializeUserNotification,
  serializeAccountActionRequest,
  serializeRiskFlag,
  getCustomerOrderActionState,
  serializeOrder,
  buildEditableCartItemsFromOrder,
  buildHourlySeriesFromOrders,
  buildWeeklyHeatmapFromOrders,
  serializeOrderItem,
  serializeManualOrderCatalogProduct,
};
