import { GoogleGenAI } from "@google/genai";
import express from "express";
import nextjs from "next";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { resolveCname, resolveTxt } from "dns/promises";
import { createServer as createNetServer } from "net";
import { WebSocketServer, WebSocket } from "ws";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Prisma } from "@prisma/client";
import { rateLimit, rateLimits } from "./src/server/rateLimit.js";
import { createAuthenticateToken } from "./src/server/auth.js";
import { registerSellerRoutes } from "./src/server/routes/seller.js";
import { requestLogger } from "./src/server/middleware/requestLogging.js";
import { corsProtection } from "./src/server/middleware/corsProtection.js";
import { getServerEnv } from "./src/lib/env.js";
import { logger } from "./src/lib/logger.js";
import { prisma, prismaDirect } from "./src/features/shared/services/database/prisma.js";
import { invalidateProductCache, invalidatePricingCache } from "./src/features/shared/services/cache/invalidation.js";
import { deleteCacheByPrefix, getOrSetCache } from "./src/features/shared/services/cache/store.js";
import { ensureRedis } from "./src/features/shared/services/messaging/redis.js";
import {
  createSession,
  getAccessCookieOptions,
  getRefreshCookieOptions,
  listSessionsForUser,
  rotateSession,
  revokeAllSessionsForUser,
  revokeSessionByRefreshToken,
  signAccessToken as signSessionAccessToken,
} from "./src/features/auth/services/sessionStore.js";
import { enqueueAnalyticsEvent, enqueueCartRecovery, enqueueOrderProcessing, enqueuePaymentProcessing, enqueueEmail, enqueueNotification, getQueue, QUEUE_NAMES } from "./src/workers/queue.js";
import {
  addressSchema,
  notificationPreferenceSchema,
  payoutMethodSchema,
  privacyRequestSchema,
  profileUpdateSchema,
  referralRedeemSchema,
  riskFlagSchema,
  spinRewardSchema,
  storefrontSettingsSchema,
  tenantSettingSchema,
  uploadAssetSchema,
  verificationReviewSchema,
  verificationSubmissionSchema,
  walletAdjustmentSchema,
} from "./src/modules/profile/validation.js";
import {
  encryptSensitiveValue,
  redactSensitiveValue,
} from "./src/features/shared/services/security/fieldEncryption.js";
import {
  uploadDataUrlToCloudinary,
  validateUploadInput,
} from "./src/features/shared/services/media/cloudinaryUpload.js";
import {
  claimDailyLoginReward,
  createNotification,
  ensureDefaultMissions,
  ensureDefaultSpinRewards,
  ensureReferralCodeForUser,
  ensureTenantSetting,
  grantReward,
  runDailySpin,
  updateMissionProgress,
} from "./src/features/admin/services/engagement/gamification.js";
import { accountingModule } from "./src/modules/accounting/index.js";
import { logisticsModule } from "./src/modules/logistics/index.js";
import {
  getCommerceChannelSettings,
  isCheckoutPaymentMethodEnabled,
  isCourierProviderEnabled,
  isManualOrderPaymentMethodEnabled,
  serializeCommerceChannelSettings,
} from "./src/features/shared/services/platform/commerceChannels.js";
import {
  calculatePathaoPrice,
  createPathaoBulkOrders,
  createPathaoOrder,
  createPathaoStore,
  getPathaoOrderInfo,
  getPathaoStoreInfo,
  getPathaoTokenDiagnostics,
  getPathaoWebhookIntegrationSecret,
  issuePathaoAccessToken,
  listPathaoAreas,
  listPathaoCities,
  listPathaoStores,
  listPathaoZones,
  refreshPathaoAccessToken,
} from "./src/features/courier/services/pathaoClient.js";
import { getRedxOrderInfo } from "./src/features/courier/services/redxApiAdapter.js";
import {
  createSteadfastBulkOrders,
  createSteadfastReturnRequest,
  getSteadfastBalance,
  getSteadfastDiagnostics,
  getSteadfastOrderInfo,
  getSteadfastPayment,
  getSteadfastPayments,
  getSteadfastPoliceStations,
  getSteadfastReturnRequest,
  getSteadfastReturnRequests,
} from "./src/features/courier/services/steadfastApiAdapter.js";
import {
  csrfHeaderName,
  getCsrfCookieHeader,
  issueCsrfToken,
} from "./src/server/security/csrf.js";
import {
  PRODUCT_STATUSES,
  SELLER_STATUSES,
  buildSellerApprovalRequirements,
  canSellerSubmitForReview,
  getMissingSellerApprovalRequirements,
  getSellerApprovalBlockedMessage,
  isSellerApproved,
  normalizeSellerStatus,
} from "./src/lib/sellerApproval.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const env = getServerEnv();

const JWT_SECRET = env.JWT_SECRET;
const PROJECT_ROOT = process.cwd();
const DEFAULT_WS_PORT = 3101;
let httpServerRef: ReturnType<express.Express["listen"]> | null = null;
let wsServerRef: WebSocketServer | null = null;
const PERFORMANCE_EVENTS_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals`;
const PERFORMANCE_ALERTS_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals:alerts`;
const PERFORMANCE_ALERT_COOLDOWN_KEY = `${env.QUEUE_PREFIX}:analytics:web-vitals:critical-alert`;
const PERFORMANCE_ALERT_WINDOW_MS = 10 * 60 * 1000;
const PERFORMANCE_ALERT_COOLDOWN_SECONDS = 30 * 60;
const PERFORMANCE_ALERT_MIN_POOR_EVENTS = 8;
const PERFORMANCE_ALERT_MIN_POOR_EVENTS_PER_ROUTE = 3;

function setPublicCacheHeaders(
  res: express.Response,
  options: { maxAgeSeconds: number; staleWhileRevalidateSeconds?: number; sharedMaxAgeSeconds?: number },
) {
  const directives = [
    "public",
    `max-age=${options.maxAgeSeconds}`,
    `s-maxage=${options.sharedMaxAgeSeconds ?? options.maxAgeSeconds}`,
  ];

  if (typeof options.staleWhileRevalidateSeconds === "number" && options.staleWhileRevalidateSeconds > 0) {
    directives.push(`stale-while-revalidate=${options.staleWhileRevalidateSeconds}`);
  }

  res.setHeader("Cache-Control", directives.join(", "));
}

function setPrivateNoStoreHeaders(res: express.Response) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
}

function assertSupportedNodeVersion(isDev: boolean) {
  if (!isDev) {
    return;
  }

  const major = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);

  if (major >= 24) {
    const message =
      `Unsupported Node.js ${process.versions.node} for local dev in this app. ` +
      "Use Node.js 20 or 22 LTS to avoid Next.js App Router manifest/runtime crashes on Windows.";
    throw new Error(message);
  }
}

// Find an open port starting from the preferred value (tries +20 range)
async function getAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  const maxPort = startPort + 20;

  while (port <= maxPort) {
    const isFree = await new Promise<boolean>(async (resolve) => {
      // Check both IPv4 and IPv6 bindings to avoid false positives when a dual-stack listener exists
      const tryHost = (host: string) =>
        new Promise<boolean>((innerResolve) => {
          const tester = createNetServer()
            .once("error", (err: any) => {
              tester.close();
              innerResolve(!(err.code === "EADDRINUSE" || err.code === "EACCES"));
            })
            .once("listening", () => {
              tester.close(() => innerResolve(true));
            })
            .listen({ port, host, exclusive: true });
        });

      const v4 = await tryHost("0.0.0.0");
      const v6 = await tryHost("::");
      resolve(v4 && v6);
    });

    if (isFree) return port;
    port += 1;
  }

  throw new Error(`No free ports in range ${startPort}-${maxPort}`);
}

const validateEmail = (email: string) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase());

const validatePassword = (pwd: string) =>
  typeof pwd === "string" && pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /[0-9]/.test(pwd);

const hashPassword = async (plain: string) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
};

async function ensurePosWalkInCustomer(tenantId?: string | null) {
  const tenantSuffix = String(tenantId || "global")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const email = `pos-walkin+${tenantSuffix || "global"}@amarshop.local`;

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      name: "POS Walk-in Customer",
      phone: null,
      role: "customer",
      tenantId: tenantId ?? null,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(crypto.randomUUID()),
    },
  });
}

async function ensureManualOrderCustomer(tenantId?: string | null) {
  const tenantSuffix = String(tenantId || "global")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const email = `manual-order+${tenantSuffix || "global"}@amarshop.local`;

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      email,
      name: "Manual Order Customer",
      phone: null,
      role: "customer",
      tenantId: tenantId ?? null,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(crypto.randomUUID()),
    },
  });
}

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

async function generateUniqueProductSku(name?: string | null, category?: string | null) {
  const prefix = makeProductSkuPrefix(name, category);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = sanitizeAlphaNumeric(crypto.randomBytes(3).toString("hex")).slice(0, 6);
    const sku = `${prefix}-${suffix}`;
    const existing = await prisma.product.findUnique({
      where: { sku },
      select: { id: true },
    });
    if (!existing) {
      return sku;
    }
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

async function generateUniqueOrderCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = sanitizeAlphaNumeric(crypto.randomBytes(4).toString("hex")).slice(0, 8);
    const orderCode = `ORD-${suffix}`;
    const existing = await prisma.order.findUnique({
      where: { orderCode },
      select: { id: true },
    });
    if (!existing) {
      return orderCode;
    }
  }

  return `ORD-${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

function toPlainNumber(value: unknown) {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value && "toNumber" in value && typeof (value as any).toNumber === "function") {
    return (value as any).toNumber();
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

async function postAccountingEntrySafe(entry: {
  reference: string;
  memo?: string;
  currency?: string;
  lines: Array<{
    accountCode: string;
    debit?: number;
    credit?: number;
    description?: string;
  }>;
}) {
  try {
    await accountingModule.ensureDefaultChartOfAccounts();
    await accountingModule.postJournalEntry({
      reference: entry.reference,
      memo: entry.memo,
      currency: entry.currency || 'BDT',
      lines: entry.lines,
    });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.toLowerCase().includes('unique')) {
      return;
    }
    console.error('[accounting] failed to post journal entry', entry.reference, message);
  }
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

async function resolveStorefrontByCustomDomain(host: string) {
  const hostname = extractHostnameFromRequestHost(host);
  if (!hostname || isPlatformHost(hostname)) {
    return null;
  }

  const matchedUser = await prisma.user.findFirst({
    where: {
      storefrontCustomDomain: hostname,
      storefrontPublished: true,
      role: { in: ["seller", "reseller"] },
      profileVisibility: { not: "private" },
    },
    select: {
      id: true,
      role: true,
      storefrontSlug: true,
    },
  });

  if (!matchedUser) {
    return null;
  }

  if (matchedUser.role === "seller" && matchedUser.storefrontSlug) {
    return { kind: "seller" as const, targetPath: `/store/${matchedUser.storefrontSlug}` };
  }

  if (matchedUser.role === "reseller") {
    const referral = await prismaDirect.resellerReferral.findUnique({
      where: { resellerId: matchedUser.id },
      select: { code: true },
    });

    if (referral?.code) {
      return { kind: "reseller" as const, targetPath: `/r/${referral.code}` };
    }
  }

  return null;
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

async function getSellerApprovalGuardSnapshot(userId: string) {
  const [seller, verificationSubmission, payoutMethodCount, warehouses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        emailVerified: true,
        phoneVerified: true,
        storeName: true,
        bio: true,
        storefrontSlug: true,
        storefrontHeadline: true,
        sellerStatus: true,
      },
    }),
    prisma.verificationSubmission.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
      },
    }),
    prisma.payoutMethod.count({
      where: { userId, status: "active" },
    }),
    prisma.warehouse.findMany({
      where: { managerId: userId },
      select: {
        address: true,
        city: true,
        phone: true,
        contactName: true,
      },
    }),
  ]);

  if (!seller) {
    return null;
  }

  const approval = buildSellerApprovalRequirementState({
    seller,
    verificationSubmission,
    payoutMethodCount,
    warehouses,
  });

  return {
    seller,
    verificationSubmission,
    payoutMethodCount,
    warehouses,
    approval,
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

async function validateCouponForCart(input: {
  code?: string | null;
  orderValue: number;
  sellerId?: string | null;
  productIds?: string[];
}) {
  const normalizedCode = String(input.code || "").trim().toUpperCase();
  if (!normalizedCode) {
    return null;
  }

  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizedCode },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          storeName: true,
        },
      },
    },
  });

  if (!coupon) {
    throw new Error("Invalid coupon code");
  }

  const now = new Date();
  const expiry = new Date(coupon.expiryDate);
  if (now > expiry) {
    throw new Error("Coupon has expired");
  }

  if (Number(input.orderValue) < Number(coupon.minOrderValue)) {
    throw new Error(`Minimum order value for this coupon is ${toPlainNumber(coupon.minOrderValue)} BDT`);
  }

  if (coupon.sellerId) {
    if (!input.sellerId || String(input.sellerId) !== String(coupon.sellerId)) {
      throw new Error("This coupon is only valid for a specific seller storefront.");
    }

    const productIdList = Array.isArray(input.productIds) ? input.productIds.map((id) => String(id)) : [];
    if (productIdList.length === 0) {
      throw new Error("Seller coupon validation requires storefront cart items.");
    }

    const scopedProducts = await prisma.product.findMany({
      where: { id: { in: productIdList } },
      select: { id: true, sellerId: true },
    });

    const allScopedToSeller =
      scopedProducts.length === productIdList.length &&
      scopedProducts.every((product) => String(product.sellerId || "") === String(coupon.sellerId));

    if (!allScopedToSeller) {
      throw new Error("This seller coupon only applies when your cart contains products from that seller only.");
    }
  }

  return {
    code: coupon.code,
    seller_id: coupon.sellerId ?? null,
    seller_name: coupon.seller?.storeName ?? coupon.seller?.name ?? null,
    discount_type: coupon.discountType,
    discount_value: toPlainNumber(coupon.discountValue),
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

async function loadManualOrderCatalogForRole(role: "seller" | "reseller", userId: string) {
  if (role === "seller") {
    const products = await prisma.product.findMany({
      where: {
        sellerId: userId,
        stock: { gt: 0 },
      },
      orderBy: { createdAt: "desc" },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
          },
        },
        inventoryItems: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ quantity: "desc" }],
        },
      },
    });

    return products.map(serializeManualOrderCatalogProduct);
  }

  const markups = await prismaDirect.resellerMarkup.findMany({
    where: { resellerId: userId },
    orderBy: { updatedAt: "desc" },
    include: {
      product: {
        include: {
          seller: {
            select: {
              id: true,
              name: true,
            },
          },
          inventoryItems: {
            include: {
              warehouse: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: [{ quantity: "desc" }],
          },
        },
      },
    },
  });

  return markups
    .filter((markup) => markup.product?.resellerEnabled && Number(markup.product?.stock ?? 0) > 0)
    .map((markup) => {
      const product = serializeManualOrderCatalogProduct(markup.product);
      const basePrice = Number(toPlainNumber(markup.product?.resellerBasePrice ?? 0) || 0);
      const salePrice = Number((basePrice + Number(toPlainNumber(markup.markupAmount) || 0)).toFixed(2));
      return {
        ...product,
        price: salePrice,
        reseller_sale_price: salePrice,
      };
    });
}

async function createManualMarketplaceOrder(args: {
  role: "seller" | "reseller";
  creator: { id: string; name?: string | null; tenantId?: string | null; refCode?: string | null };
  payload: any;
}) {
  const { role, creator, payload } = args;
  const customerName = String(payload?.customerName || "").trim();
  const customerPhone = String(payload?.customerPhone || "").trim();
  const customerAddress = String(payload?.customerAddress || "").trim();
  const customerCity = String(payload?.customerCity || "").trim();
  const note = typeof payload?.note === "string" ? payload.note.trim() : "";
  const paymentMethod = typeof payload?.paymentMethod === "string" ? payload.paymentMethod.trim() : "cod";
  const items = Array.isArray(payload?.items) ? payload.items : [];

  if (!customerName || !customerPhone || !customerAddress || !customerCity) {
    throw new Error("Customer name, phone, address, and city are required.");
  }

  if (items.length === 0) {
    throw new Error("Add at least one product to create a manual order.");
  }

  if (!(await isManualOrderPaymentMethodEnabled(paymentMethod))) {
    throw new Error("Only Cash on delivery is enabled right now.");
  }

  const catalog = await loadManualOrderCatalogForRole(role, creator.id);
  const catalogById = new Map<string, any>(catalog.map((product: any) => [String(product.id), product]));
  const normalizedItems: Array<{
    product: any;
    productId: string;
    quantity: number;
    unitPrice: number;
    variantSummary: string | null;
    variantSku: string | null;
    selectedInventoryItem: any;
  }> = items.map((item: any) => {
    const productId = String(item?.productId || "");
    const product = catalogById.get(productId);
    if (!product) {
      throw new Error(`Product ${productId} is not available for manual orders.`);
    }

    const quantity = Math.max(1, Number(item?.quantity || 1));
    const requestedUnitPrice = Number(item?.unitPrice ?? product.price ?? 0);
    const floorPrice =
      role === "reseller"
        ? Number(product.reseller_base_price ?? product.price ?? 0)
        : 0;

    if (!Number.isFinite(requestedUnitPrice) || requestedUnitPrice <= 0) {
      throw new Error(`Enter a valid unit price for ${product.name}.`);
    }

    if (role === "reseller" && requestedUnitPrice < floorPrice) {
      throw new Error(`Reseller price for ${product.name} cannot be below ${floorPrice}.`);
    }

    if (Number(product.stock ?? 0) < quantity) {
      throw new Error(`${product.name} only has ${product.stock} unit(s) available.`);
    }

    const selectedInventoryItem =
      Array.isArray(product.inventory_items)
        ? product.inventory_items.find((entry: any) => Number(entry.quantity) >= quantity) || product.inventory_items[0]
        : null;

    return {
      product,
      productId,
      quantity,
      unitPrice: requestedUnitPrice,
      variantSummary: typeof item?.variantSummary === "string" ? item.variantSummary.trim() : null,
      variantSku: typeof item?.variantSku === "string" ? item.variantSku.trim().toUpperCase() : null,
      selectedInventoryItem,
    };
  });

  const customerUser = await ensureManualOrderCustomer(creator.tenantId ?? null);
  const paymentStatus = paymentMethod === "cod" ? "pending" : "paid";
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const orderCode = await generateUniqueOrderCode();
    const order = await tx.order.create({
      data: {
        orderCode,
        userId: customerUser.id,
        tenantId: creator.tenantId ?? null,
        total: normalizedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
        status: "processing",
        paymentMethod,
        paymentStatus,
        paidAt: paymentStatus === "paid" ? now : null,
        refCode: role === "reseller" ? creator.refCode ?? null : null,
        shippingAddress: {
          name: customerName,
          phone: customerPhone,
          address: customerAddress,
          city: customerCity,
          note: note || null,
          manual_order: true,
          created_by_role: role,
          created_by_user_id: creator.id,
        },
        shipmentMetadata: {
          manual_order: true,
          createdByRole: role,
          createdByUserId: creator.id,
          createdByName: creator.name ?? null,
          note: note || null,
        },
        items: {
          create: normalizedItems.map((item) => ({
            productId: item.productId,
            qty: item.quantity,
            price: item.unitPrice,
            variantSummary: item.variantSummary,
            variantSku: item.variantSku,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    const productRowById = new Map<string, (typeof normalizedItems)[number]>(
      normalizedItems.map((item) => [item.productId, item]),
    );
    type ShipmentGroup = {
      sellerId: string;
      warehouseId: string | null;
      total: number;
      itemCount: number;
      items: Array<{ orderItemId: string; productId: string; qty: number; price: number }>;
    };

    const shipmentGroups = new Map<string, ShipmentGroup>();

    for (const orderItem of order.items) {
      const source = productRowById.get(orderItem.productId);
      if (!source?.product?.seller_id) continue;
      const warehouseId = source.selectedInventoryItem?.warehouse_id || null;
      const groupKey = `${source.product.seller_id}::${warehouseId || "unassigned"}`;
      const existingGroup: ShipmentGroup = shipmentGroups.get(groupKey) ?? {
        sellerId: String(source.product.seller_id),
        warehouseId,
        total: 0,
        itemCount: 0,
        items: [],
      };

      existingGroup.total += Number(orderItem.price) * Number(orderItem.qty);
      existingGroup.itemCount += Number(orderItem.qty);
      existingGroup.items.push({
        orderItemId: orderItem.id,
        productId: orderItem.productId,
        qty: Number(orderItem.qty),
        price: Number(orderItem.price),
      });
      shipmentGroups.set(groupKey, existingGroup);
    }

    for (const group of shipmentGroups.values()) {
      const shipment = await tx.orderShipment.create({
        data: {
          orderId: order.id,
          sellerId: group.sellerId,
          warehouseId: group.warehouseId,
          status: "processing",
          total: group.total,
          itemCount: group.itemCount,
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

    for (const item of normalizedItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            decrement: item.quantity,
          },
        },
      });

      if (item.selectedInventoryItem?.id) {
        await tx.inventoryItem.update({
          where: { id: item.selectedInventoryItem.id },
          data: {
            quantity: {
              decrement: item.quantity,
            },
          },
        });
      }
    }

    await tx.invoice.create({
      data: {
        orderId: order.id,
        userId: customerUser.id,
        status: paymentStatus === "paid" ? "paid" : "draft",
        subtotal: order.total,
        tax: 0,
        total: order.total,
      },
    });

    return order;
  });
}

async function loadRecentManualOrdersForSeller(userId: string) {
  const orders = await prisma.order.findMany({
    where: {
      items: {
        some: {
          product: {
            sellerId: userId,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              sku: true,
            },
          },
        },
      },
    },
  });

  return orders
    .filter((order) => {
      const shippingAddress =
        order.shippingAddress && typeof order.shippingAddress === "object"
          ? (order.shippingAddress as Record<string, any>)
          : null;
      return (
        Boolean(shippingAddress?.manual_order) &&
        shippingAddress?.created_by_role === "seller" &&
        String(shippingAddress?.created_by_user_id || "") === userId
      );
    })
    .map((order) => ({
      ...serializeOrder(order),
      items: order.items.map(serializeOrderItem),
    }));
}

async function loadRecentManualOrdersForReseller(userId: string) {
  const referral = await prismaDirect.resellerReferral.findUnique({
    where: { resellerId: userId },
    select: { code: true },
  });
  if (!referral?.code) {
    return [];
  }
  const orders = await prisma.order.findMany({
    where: {
      refCode: referral.code,
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              sku: true,
            },
          },
        },
      },
    },
  });

  return orders
    .filter((order) => {
      const shippingAddress =
        order.shippingAddress && typeof order.shippingAddress === "object"
          ? (order.shippingAddress as Record<string, any>)
          : null;
      return (
        Boolean(shippingAddress?.manual_order) &&
        shippingAddress?.created_by_role === "reseller" &&
        String(shippingAddress?.created_by_user_id || "") === userId
      );
    })
    .map((order) => ({
      ...serializeOrder(order),
      items: order.items.map(serializeOrderItem),
    }));
}

const MANUAL_ORDER_LOCKED_STATUSES = new Set([
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "returned",
  "delivery_failed",
  "cancelled",
  "refunded",
]);

function canUpdateManualOrder(status: string | null | undefined) {
  return !MANUAL_ORDER_LOCKED_STATUSES.has(String(status || "").toLowerCase());
}

function extractManualOrderMeta(order: any) {
  const shippingAddress =
    order?.shippingAddress && typeof order.shippingAddress === "object"
      ? (order.shippingAddress as Record<string, any>)
      : null;
  return {
    shippingAddress,
    isManual: Boolean(shippingAddress?.manual_order),
    createdByRole: String(shippingAddress?.created_by_role || ""),
    createdByUserId: String(shippingAddress?.created_by_user_id || ""),
  };
}

async function loadOwnedManualOrder(role: "seller" | "reseller", userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              sellerId: true,
            },
          },
        },
      },
      shipments: {
        include: {
          items: true,
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  const meta = extractManualOrderMeta(order);
  if (!meta.isManual || meta.createdByRole !== role || meta.createdByUserId !== userId) {
    return null;
  }

  return order;
}

async function updateManualMarketplaceOrder(args: {
  role: "seller" | "reseller";
  userId: string;
  orderId: string;
  payload: any;
}) {
  const { role, userId, orderId, payload } = args;
  const order = await loadOwnedManualOrder(role, userId, orderId);
  if (!order) {
    throw new Error("Manual order not found.");
  }
  if (!canUpdateManualOrder(order.status)) {
    throw new Error("This manual order can no longer be edited.");
  }

  const customerName = String(payload?.customerName || "").trim();
  const customerPhone = String(payload?.customerPhone || "").trim();
  const customerAddress = String(payload?.customerAddress || "").trim();
  const customerCity = String(payload?.customerCity || "").trim();
  const paymentMethod = typeof payload?.paymentMethod === "string" ? payload.paymentMethod.trim() : order.paymentMethod || "cod";
  const note = typeof payload?.note === "string" ? payload.note.trim() : "";

  if (!customerName || !customerPhone || !customerAddress || !customerCity) {
    throw new Error("Customer name, phone, address, and city are required.");
  }

  if (!(await isManualOrderPaymentMethodEnabled(paymentMethod))) {
    throw new Error("Only Cash on delivery is enabled right now.");
  }

  const currentShippingAddress =
    order.shippingAddress && typeof order.shippingAddress === "object"
      ? (order.shippingAddress as Record<string, any>)
      : {};
  const currentShipmentMetadata =
    order.shipmentMetadata && typeof order.shipmentMetadata === "object"
      ? (order.shipmentMetadata as Record<string, any>)
      : {};

  const nextPaymentStatus =
    paymentMethod === "cod" ? (order.paymentStatus === "paid" ? "paid" : "pending") : "paid";

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentMethod,
      paymentStatus: nextPaymentStatus,
      paidAt: nextPaymentStatus === "paid" ? order.paidAt ?? new Date() : null,
      shippingAddress: {
        ...currentShippingAddress,
        name: customerName,
        phone: customerPhone,
        address: customerAddress,
        city: customerCity,
        note: note || null,
      },
      shipmentMetadata: {
        ...currentShipmentMetadata,
        note: note || null,
        updatedByRole: role,
        updatedByUserId: userId,
      },
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              sku: true,
            },
          },
        },
      },
    },
  });

  return {
    ...serializeOrder(updated),
    items: updated.items.map(serializeOrderItem),
  };
}

async function cancelManualMarketplaceOrder(args: {
  role: "seller" | "reseller";
  userId: string;
  orderId: string;
}) {
  const { role, userId, orderId } = args;
  const order = await loadOwnedManualOrder(role, userId, orderId);
  if (!order) {
    throw new Error("Manual order not found.");
  }
  if (!canUpdateManualOrder(order.status)) {
    throw new Error("This manual order can no longer be cancelled.");
  }

  const currentShippingAddress =
    order.shippingAddress && typeof order.shippingAddress === "object"
      ? (order.shippingAddress as Record<string, any>)
      : {};
  const currentShipmentMetadata =
    order.shipmentMetadata && typeof order.shipmentMetadata === "object"
      ? (order.shipmentMetadata as Record<string, any>)
      : {};

  const shipmentWarehouseMap = new Map<string, string | null>();
  for (const shipment of order.shipments || []) {
    for (const shipmentItem of shipment.items || []) {
      shipmentWarehouseMap.set(shipmentItem.orderItemId, shipment.warehouseId ?? null);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    for (const orderItem of order.items || []) {
      await tx.product.update({
        where: { id: orderItem.productId },
        data: {
          stock: {
            increment: Number(orderItem.qty || 0),
          },
        },
      });

      const warehouseId = shipmentWarehouseMap.get(orderItem.id);
      if (warehouseId) {
        await tx.inventoryItem.updateMany({
          where: {
            productId: orderItem.productId,
            warehouseId,
          },
          data: {
            quantity: {
              increment: Number(orderItem.qty || 0),
            },
          },
        });
      }
    }

    await tx.orderShipment.updateMany({
      where: { orderId: order.id },
      data: {
        status: "cancelled",
      },
    });

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: "cancelled",
        paymentStatus: order.paymentMethod === "cod" ? "cancelled" : order.paymentStatus,
        shippingAddress: {
          ...currentShippingAddress,
          cancelled_by_role: role,
          cancelled_by_user_id: userId,
        },
        shipmentMetadata: {
          ...currentShipmentMetadata,
          cancellationSource: "manual_workspace",
          cancelledByRole: role,
          cancelledByUserId: userId,
        },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                image: true,
                sku: true,
              },
            },
          },
        },
      },
    });
  });

  return {
    ...serializeOrder(updated),
    items: updated.items.map(serializeOrderItem),
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapePdfText(value: unknown) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

function buildSimplePdf(lines: Array<{ text: string; x: number; y: number; size?: number }>) {
  const content = lines
    .map(({ text, x, y, size = 12 }) => `BT /F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`)
    .join("\n");

  const stream = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function formatInvoiceCurrency(value: unknown) {
  return `${toPlainNumber(value).toFixed(2)} BDT`;
}

function buildInvoiceAddressLines(shippingAddress: Record<string, any>) {
  const lines = [
    shippingAddress.fullName || shippingAddress.name || "Customer",
    shippingAddress.phone || null,
    shippingAddress.alternatePhone || shippingAddress.alternate_phone || null,
    shippingAddress.address || null,
    [shippingAddress.upazila, shippingAddress.district, shippingAddress.division].filter(Boolean).join(", ") || null,
    shippingAddress.city || null,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  return lines;
}

function buildInvoiceSellerEntries(order: any) {
  const sellerMap = new Map<string, { sellerName: string; storeName: string | null; email: string | null; phone: string | null }>();

  const shipments = Array.isArray(order?.shipments) ? order.shipments : [];
  for (const shipment of shipments) {
    const sellerId = String(shipment?.sellerId || shipment?.seller?.id || "").trim();
    const sellerName = String(shipment?.seller?.name || "").trim();
    const storeName = String(shipment?.seller?.storeName || "").trim() || null;
    const email = String(shipment?.seller?.email || "").trim() || null;
    const phone = String(shipment?.seller?.phone || "").trim() || null;
    const key = sellerId || `${sellerName}:${storeName || ""}`;
    if (!key || !sellerName) continue;
    if (!sellerMap.has(key)) {
      sellerMap.set(key, { sellerName, storeName, email, phone });
    }
  }

  if (sellerMap.size === 0 && Array.isArray(order?.items)) {
    for (const item of order.items) {
      const sellerId = String(item?.product?.seller?.id || "").trim();
      const sellerName = String(item?.product?.seller?.name || "").trim();
      const storeName = String(item?.product?.seller?.storeName || "").trim() || null;
      const email = String(item?.product?.seller?.email || "").trim() || null;
      const phone = String(item?.product?.seller?.phone || "").trim() || null;
      const key = sellerId || `${sellerName}:${storeName || ""}`;
      if (!key || !sellerName) continue;
      if (!sellerMap.has(key)) {
        sellerMap.set(key, { sellerName, storeName, email, phone });
      }
    }
  }

  return Array.from(sellerMap.values());
}

function buildInvoiceHtml(order: any, shippingAddress: Record<string, any>) {
  const itemSubtotal = Array.isArray(order.items)
    ? order.items.reduce((sum: number, item: any) => sum + toPlainNumber(item.price) * Number(item.qty || 0), 0)
    : 0;
  const orderTotal = toPlainNumber(order.total);
  const adjustmentAmount = Math.max(0, itemSubtotal - orderTotal);
  const shippingLines = buildInvoiceAddressLines(shippingAddress);
  const sellerEntries = buildInvoiceSellerEntries(order);
  const shipments = Array.isArray(order.shipments) ? order.shipments : [];
  const customerEmail = String(order?.user?.email || "").trim() || null;
  const paymentReference = String(order?.paymentIntentId || order?.trackingId || order?.id || "").trim() || null;
  const rows = order.items
    .map(
      (item: any) => `
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <div style="font-weight:700;color:#0f172a;">${escapeHtml(item.product?.name || "Product")}</div>
            ${
              item.variantSummary
                ? `<div style="margin-top:4px;font-size:12px;color:#0f766e;">${escapeHtml(item.variantSummary)}</div>`
                : ""
            }
            ${
              item.variantSku || item.product?.sku
                ? `<div style="margin-top:4px;font-size:11px;color:#64748b;">SKU: ${escapeHtml(item.variantSku || item.product?.sku)}</div>`
                : ""
            }
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:top;">${escapeHtml(item.qty)}</td>
          <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;">${formatInvoiceCurrency(item.price)}</td>
          <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;font-weight:700;">${formatInvoiceCurrency(toPlainNumber(item.price) * item.qty)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${escapeHtml(order.id)}</title>
        <style>
          @page {
            size: A4;
            margin: 14mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: Arial, sans-serif;
            background: #f8fafc;
            margin: 0;
            padding: 24px;
            color: #0f172a;
          }
          .invoice-shell {
            width: 100%;
            max-width: 794px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 24px;
            padding: 32px;
          }
          .brand-lockup {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .brand-logo {
            width: 58px;
            height: 58px;
            border-radius: 18px;
            border: 1px solid #dbeafe;
            background: linear-gradient(135deg, #ffffff 0%, #ecfeff 100%);
            padding: 8px;
          }
          .brand-copy {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .brand-name {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.02em;
          }
          .brand-subtitle {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: .2em;
            color: #0f766e;
            text-transform: uppercase;
          }
          .summary-grid,
          .meta-grid,
          .seller-grid {
            display: grid;
            gap: 18px;
          }
          .summary-grid,
          .meta-grid { grid-template-columns: 1fr 1fr; }
          .seller-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          @media print {
            body { background: #ffffff; padding: 0; }
            .invoice-shell {
              max-width: none;
              border: 0;
              border-radius: 0;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-shell">
          <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:24px;">
            <div>
              <div class="brand-lockup">
                <img src="/icon.svg" alt="LofiMart" class="brand-logo" />
                <div class="brand-copy">
                  <div class="brand-subtitle">LofiMart Invoice</div>
                  <div class="brand-name">LofiMart</div>
                </div>
              </div>
              <h1 style="margin:18px 0 0;font-size:28px;">Order #${escapeHtml(order.orderCode || order.id)}</h1>
              <p style="margin:12px 0 0;font-size:14px;color:#475569;">Placed on ${escapeHtml(new Date(order.createdAt).toLocaleString())}</p>
            </div>
            <div style="min-width:260px;padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Invoice summary</p>
              <p style="margin:12px 0 0;font-size:14px;"><strong>Internal ID:</strong> ${escapeHtml(order.id)}</p>
              <p style="margin:8px 0 0;font-size:14px;"><strong>Order status:</strong> ${escapeHtml(String(order.status).replaceAll("_", " "))}</p>
              <p style="margin:8px 0 0;font-size:14px;"><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod || "N/A")}</p>
              <p style="margin:8px 0 0;font-size:14px;"><strong>Payment status:</strong> ${escapeHtml(order.paymentStatus || "untracked")}</p>
            </div>
          </div>
          <div class="meta-grid" style="margin-top:28px;">
            <div style="padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Billing and delivery</p>
              <div style="font-size:14px;line-height:1.75;color:#334155;">
                ${shippingLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
                ${customerEmail ? `<div>${escapeHtml(customerEmail)}</div>` : ""}
              </div>
            </div>
            <div style="padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Shipping progress</p>
              <div style="font-size:14px;line-height:1.75;color:#334155;">
                <div><strong>Courier:</strong> ${escapeHtml(order.courierProvider || "Pending assignment")}</div>
                <div><strong>Tracking:</strong> ${escapeHtml(order.trackingId || "Pending assignment")}</div>
                <div><strong>Shipment count:</strong> ${shipments.length}</div>
                ${
                  shipments.length > 0
                    ? shipments
                        .slice(0, 3)
                        .map(
                          (shipment: any) =>
                            `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;"><strong>${escapeHtml(
                              shipment.warehouse?.name || "Shipment",
                            )}:</strong> ${escapeHtml(String(shipment.status || "processing").replaceAll("_", " "))}${
                              shipment.trackingId ? ` • ${escapeHtml(shipment.trackingId)}` : ""
                            }</div>`,
                        )
                        .join("")
                    : `<div style="margin-top:8px;color:#64748b;">Courier allocation will appear here after seller processing.</div>`
                }
              </div>
            </div>
          </div>
          ${
            sellerEntries.length > 0
              ? `<div style="margin-top:18px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
            <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.16em;color:#64748b;text-transform:uppercase;">Seller information</p>
            <div class="seller-grid" style="gap:12px;">
              ${sellerEntries
                .map(
                  (entry) => `<div style="padding:14px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff;">
                    <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(entry.storeName || entry.sellerName)}</div>
                    <div style="margin-top:4px;font-size:13px;color:#475569;">Seller: ${escapeHtml(entry.sellerName)}</div>
                    ${entry.phone ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">Phone: ${escapeHtml(entry.phone)}</div>` : ""}
                    ${entry.email ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">Email: ${escapeHtml(entry.email)}</div>` : ""}
                  </div>`,
                )
                .join("")}
            </div>
          </div>`
              : ""
          }
          <table style="width:100%;border-collapse:collapse;margin-top:28px;font-size:14px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:14px 16px;text-align:left;border-bottom:1px solid #e5e7eb;">Item</th>
                <th style="padding:14px 16px;text-align:center;border-bottom:1px solid #e5e7eb;">Qty</th>
                <th style="padding:14px 16px;text-align:right;border-bottom:1px solid #e5e7eb;">Unit Price</th>
                <th style="padding:14px 16px;text-align:right;border-bottom:1px solid #e5e7eb;">Line Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="margin-top:24px;display:flex;justify-content:flex-end;">
            <div style="width:100%;max-width:320px;padding:20px;border:1px solid #e2e8f0;border-radius:18px;background:#f8fafc;">
              <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                <span style="color:#64748b;">Items subtotal</span>
                <strong>${formatInvoiceCurrency(itemSubtotal)}</strong>
              </div>
              <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                <span style="color:#64748b;">Shipping</span>
                <strong>Free</strong>
              </div>
              ${paymentReference ? `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                <span style="color:#64748b;">Reference ID</span>
                <strong>${escapeHtml(paymentReference)}</strong>
              </div>` : ""}
              ${
                adjustmentAmount > 0
                  ? `<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;">
                <span style="color:#64748b;">Discount / adjustment</span>
                <strong style="color:#0f766e;">-${formatInvoiceCurrency(adjustmentAmount)}</strong>
              </div>`
                  : ""
              }
              <div style="display:flex;justify-content:space-between;padding:14px 0 0;margin-top:8px;border-top:1px solid #e5e7eb;font-size:18px;">
                <span style="font-weight:700;">Total charged</span>
                <strong style="color:#0f766e;">${formatInvoiceCurrency(orderTotal)}</strong>
              </div>
            </div>
          </div>
          <div style="margin-top:28px;padding:18px 20px;border-radius:18px;background:#0f172a;color:#e2e8f0;page-break-inside:avoid;">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#94a3b8;">Support note</p>
            <p style="margin:10px 0 0;font-size:14px;line-height:1.7;">
              Keep this invoice for delivery reference, support follow-up, and payment clarification. If you need help, share order code <strong>${escapeHtml(
                order.orderCode || order.id,
              )}</strong> with support.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

function buildInvoicePdf(order: any, shippingAddress: Record<string, any>) {
  const itemSubtotal = Array.isArray(order.items)
    ? order.items.reduce((sum: number, item: any) => sum + toPlainNumber(item.price) * Number(item.qty || 0), 0)
    : 0;
  const orderTotal = toPlainNumber(order.total);
  const adjustmentAmount = Math.max(0, itemSubtotal - orderTotal);
  const addressLines = buildInvoiceAddressLines(shippingAddress);
  const sellerEntries = buildInvoiceSellerEntries(order);
  const customerEmail = String(order?.user?.email || "").trim() || null;
  const paymentReference = String(order?.paymentIntentId || order?.trackingId || order?.id || "").trim() || null;
  const lines: Array<{ text: string; x: number; y: number; size?: number }> = [
    { text: "LofiMart Invoice", x: 40, y: 800, size: 12 },
    { text: `Order #${order.orderCode || order.id}`, x: 40, y: 775, size: 22 },
    { text: `Placed: ${new Date(order.createdAt).toLocaleString()}`, x: 40, y: 755, size: 11 },
    { text: `Internal ID: ${order.id}`, x: 360, y: 792, size: 10 },
    { text: `Payment: ${order.paymentMethod || "N/A"}`, x: 360, y: 775, size: 11 },
    { text: `Payment status: ${order.paymentStatus || "untracked"}`, x: 360, y: 758, size: 11 },
    { text: `Order status: ${String(order.status).replaceAll("_", " ")}`, x: 360, y: 741, size: 11 },
    { text: "Billing and delivery", x: 40, y: 715, size: 13 },
    { text: "Shipping progress", x: 320, y: 715, size: 13 },
    { text: `Courier: ${String(order.courierProvider || "Pending assignment")}`, x: 320, y: 695, size: 10 },
    { text: `Tracking: ${String(order.trackingId || "Pending assignment")}`, x: 320, y: 678, size: 10 },
    { text: `Shipments: ${String(Array.isArray(order.shipments) ? order.shipments.length : 0)}`, x: 320, y: 661, size: 10 },
    { text: "Items", x: 40, y: 610, size: 13 },
    { text: "Item", x: 40, y: 590, size: 11 },
    { text: "Qty", x: 310, y: 590, size: 11 },
    { text: "Unit", x: 380, y: 590, size: 11 },
    { text: "Total", x: 480, y: 590, size: 11 },
  ];

  let addressY = 695;
  for (const line of addressLines.slice(0, 4)) {
    lines.push({ text: String(line), x: 40, y: addressY, size: 10 });
    addressY -= 17;
  }
  if (customerEmail) {
    lines.push({ text: customerEmail, x: 40, y: addressY, size: 10 });
  }

  if (sellerEntries.length > 0) {
    lines.push({ text: "Seller information", x: 40, y: 628, size: 12 });
    let sellerY = 612;
    for (const entry of sellerEntries.slice(0, 4)) {
      lines.push({ text: `${entry.storeName || entry.sellerName} / Seller: ${entry.sellerName}`, x: 40, y: sellerY, size: 9 });
      sellerY -= 14;
      if (entry.phone || entry.email) {
        lines.push({ text: `${entry.phone || "No phone"}${entry.email ? ` / ${entry.email}` : ""}`, x: 48, y: sellerY, size: 8 });
        sellerY -= 12;
      }
    }
  }

  let currentY = sellerEntries.length > 0 ? 548 : 570;
  for (const item of order.items) {
    if (currentY < 150) break;
    const productName = String(item.product?.name || "Product").slice(0, 42);
    const variantText = item.variantSummary ? ` / ${String(item.variantSummary).slice(0, 18)}` : "";
    lines.push({ text: `${productName}${variantText}`, x: 40, y: currentY, size: 10 });
    lines.push({ text: String(item.qty), x: 315, y: currentY, size: 10 });
    lines.push({ text: formatInvoiceCurrency(item.price), x: 380, y: currentY, size: 10 });
    lines.push({ text: formatInvoiceCurrency(toPlainNumber(item.price) * item.qty), x: 470, y: currentY, size: 10 });
    currentY -= 18;
    if (item.variantSku || item.product?.sku) {
      lines.push({ text: `SKU: ${String(item.variantSku || item.product?.sku).slice(0, 42)}`, x: 48, y: currentY, size: 8 });
      currentY -= 14;
    }
  }

  currentY -= 10;
  lines.push({ text: `Items subtotal: ${formatInvoiceCurrency(itemSubtotal)}`, x: 330, y: currentY, size: 11 });
  lines.push({ text: "Shipping: Free", x: 360, y: currentY - 18, size: 11 });
  if (paymentReference) {
    lines.push({ text: `Reference: ${paymentReference}`, x: 330, y: currentY - 36, size: 10 });
  }
  if (adjustmentAmount > 0) {
    lines.push({ text: `Discount / adjustment: -${formatInvoiceCurrency(adjustmentAmount)}`, x: 290, y: currentY - (paymentReference ? 54 : 36), size: 11 });
    lines.push({ text: `Total charged: ${formatInvoiceCurrency(orderTotal)}`, x: 325, y: currentY - (paymentReference ? 80 : 62), size: 14 });
  } else {
    lines.push({ text: `Total charged: ${formatInvoiceCurrency(orderTotal)}`, x: 325, y: currentY - (paymentReference ? 60 : 42), size: 14 });
  }
  lines.push({
    text: `Keep invoice for support reference. Use order code ${String(order.orderCode || order.id).slice(0, 36)} if you contact support.`,
    x: 40,
    y: 70,
    size: 9,
  });

  return buildSimplePdf(lines);
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1).fill(0);

  for (let i = 0; i < a.length; i += 1) {
    current[0] = i + 1;
    for (let j = 0; j < b.length; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      current[j + 1] = Math.min(
        current[j] + 1,
        previous[j + 1] + 1,
        previous[j] + cost,
      );
    }

    for (let j = 0; j < previous.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function calculateFuzzySearchScore(query: string, haystack: string) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedHaystack = normalizeSearchText(haystack);

  if (!normalizedQuery || !normalizedHaystack) return 0;
  if (normalizedHaystack.includes(normalizedQuery)) return 100;

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const haystackTokens = normalizedHaystack.split(" ").filter(Boolean);
  let score = 0;

  for (const queryToken of queryTokens) {
    let bestTokenScore = 0;

    for (const haystackToken of haystackTokens) {
      if (haystackToken.includes(queryToken) || queryToken.includes(haystackToken)) {
        bestTokenScore = Math.max(bestTokenScore, 90);
        continue;
      }

      const distance = levenshteinDistance(queryToken, haystackToken);
      const maxLength = Math.max(queryToken.length, haystackToken.length);
      const similarity = maxLength > 0 ? 1 - distance / maxLength : 0;

      if (similarity >= 0.72) {
        bestTokenScore = Math.max(bestTokenScore, Math.round(similarity * 100));
      }
    }

    score += bestTokenScore;
  }

  return queryTokens.length ? Math.round(score / queryTokens.length) : 0;
}

function calculateShippingPreview(input: {
  city?: string | null;
  subtotal?: number;
  itemCount?: number;
  warehouseRule?: {
    insideDhakaFee?: number | null;
    outsideDhakaFee?: number | null;
    insideDhakaEta?: string | null;
    outsideDhakaEta?: string | null;
    warehouseName?: string | null;
    freeShippingThresholdOverride?: number | null;
  } | null;
}) {
  const normalizedCity = String(input.city ?? "").trim().toLowerCase();
  const subtotal = Math.max(0, Number(input.subtotal ?? 0) || 0);
  const itemCount = Math.max(1, Number(input.itemCount ?? 1) || 1);
  const warehouseRule = input.warehouseRule ?? null;
  const isDhaka = ["dhaka"].includes(normalizedCity);

  const profile =
    isDhaka
      ? { fee: 60, eta: "1-2 business days", zone: "inside_dhaka" as const }
      : ["chittagong", "chট্টগ্রাম", "ctg", "sylhet", "rajshahi", "khulna"].includes(normalizedCity)
        ? { fee: 90, eta: "2-4 business days", zone: "metro_outside_dhaka" as const }
        : { fee: 120, eta: "3-5 business days", zone: "nationwide" as const };

  const handlingFee = itemCount >= 5 ? 20 : 0;
  const baseFee = isDhaka
    ? warehouseRule?.insideDhakaFee ?? profile.fee
    : warehouseRule?.outsideDhakaFee ?? profile.fee;
  const estimatedFee = baseFee + handlingFee;
  const estimatedEta = isDhaka
    ? warehouseRule?.insideDhakaEta || profile.eta
    : warehouseRule?.outsideDhakaEta || profile.eta;

  return {
    zone: profile.zone,
    city: normalizedCity || null,
    estimated_fee: estimatedFee,
    estimated_eta: estimatedEta,
    cod_available: true,
    warehouse_rule_applied: Boolean(warehouseRule),
    warehouse_name: warehouseRule?.warehouseName ?? null,
    free_shipping_threshold_override: warehouseRule?.freeShippingThresholdOverride ?? null,
  };
}

function userCartKey(userId: string | number) {
  return `${env.REDIS_PREFIX}:cart:${userId}`;
}

function cartRecoveryJobId(userId: string | number) {
  return `cart-recovery:${userId}`;
}

async function createVerificationToken(
  userId: string,
  table: "email_verifications" | "password_resets" | "phone_verifications",
  ttlMinutes: number,
) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  if (table === "email_verifications") {
    await prisma.emailVerificationToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  } else if (table === "password_resets") {
    await prisma.passwordResetToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  } else {
    await prisma.phoneVerificationToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }

  return { token, expiresAt };
}

async function startServer() {
  logger.info("server.starting", {
    environment: env.APP_ENV,
    node: process.version,
  });

  const app = express();
  app.set("trust proxy", true);
  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const PORT = await getAvailablePort(preferredPort);
  const isDev = process.env.NODE_ENV !== "production";
  assertSupportedNodeVersion(isDev);

  const preferredWsPort = parseInt(process.env.WS_PORT || String(DEFAULT_WS_PORT), 10);
  const wsPort = await getAvailablePort(preferredWsPort);
  process.env.WS_PORT = wsPort.toString();

  // next() is a CJS-style export; in TS+ESM builds it can type as a namespace import.
  // Cast keeps the production build compile step stable.
  const nextApp = (nextjs as any)({
    dev: isDev,
    dir: PROJECT_ROOT,
    hostname: "0.0.0.0",
    port: PORT,
  });
  const handleNextRequest = nextApp.getRequestHandler();

  await nextApp.prepare();
  logger.info("server.next.ready", {
    port: PORT,
    wsPort,
  });

  app.get("/__ping", (_req, res) => {
    res.status(200).json({ ok: true, ts: Date.now() });
  });

  app.get("/api/auth/csrf", (_req, res) => {
    const token = issueCsrfToken();
    res.setHeader("Set-Cookie", getCsrfCookieHeader(token));
    res.json({ csrf_token: token, header_name: csrfHeaderName });
  });

  app.use(requestLogger);
  app.use(corsProtection);
  app.use(express.json());
  const signAccessToken = (payload: any, sid: string) => signSessionAccessToken(payload, sid);

  // Stripe (payments)
  const stripeSecret = env.STRIPE_SECRET_KEY;
  const stripe = stripeSecret ? new (await import("stripe")).default(stripeSecret, { apiVersion: "2024-06-20" as any }) : null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAuth = supabaseUrl && supabasePublishableKey
    ? createSupabaseClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;
  const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
    ? createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

  // Cloudinary (media)

  // Helper to ensure a reseller has a referral code
  const ensureReferralCode = async (resellerId: string) => {
    const existing = await prismaDirect.resellerReferral.findUnique({
      where: { resellerId },
      select: { code: true, clicks: true },
    });

    if (existing) {
      return existing;
    }

    return prismaDirect.resellerReferral.create({
      data: {
        resellerId,
        code: crypto.randomUUID().slice(0, 8),
      },
      select: { code: true, clicks: true },
    });
  };

  const getResellerIdFromOrderRefCode = async (refCode?: string | null) => {
    const normalizedRefCode = String(refCode || "").trim();
    if (!normalizedRefCode) {
      return null;
    }

    const referral = await prismaDirect.resellerReferral.findUnique({
      where: { code: normalizedRefCode },
      select: { resellerId: true },
    });

    return referral?.resellerId ?? null;
  };

  const settleResellerCommissionsForOrder = async (orderId: string) => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                resellerEnabled: true,
                resellerBasePrice: true,
              },
            },
          },
        },
      },
    });

    if (!order) return;
    const resellerId = await getResellerIdFromOrderRefCode(order.refCode);
    if (!resellerId) return;

    const markupRows = await prismaDirect.resellerMarkup.findMany({
      where: {
        resellerId,
        productId: {
          in: order.items.map((item) => item.productId),
        },
      },
      select: {
        productId: true,
        markupAmount: true,
      },
    });
    const markupMap = new Map(markupRows.map((row) => [row.productId, Number(toPlainNumber(row.markupAmount) || 0)]));

    for (const item of order.items) {
      if (!item.product?.resellerEnabled) continue;
      const basePrice = Number(toPlainNumber(item.product.resellerBasePrice ?? 0) || 0);
      const soldPrice = Number(toPlainNumber(item.price) || 0);
      const markupAmount = markupMap.get(item.productId);
      const effectiveMargin = Number.isFinite(markupAmount as number)
        ? Math.max(Number(markupAmount || 0), 0)
        : Math.max(soldPrice - basePrice, 0);
      const totalCommission = Number((effectiveMargin * Number(item.qty)).toFixed(2));

      if (totalCommission <= 0) {
        continue;
      }

      const existingCommission = await prismaDirect.resellerCommission.findFirst({
        where: {
          resellerId,
          orderId: order.id,
          productId: item.productId,
        },
        select: { id: true },
      });

      if (existingCommission) {
        await prismaDirect.resellerCommission.update({
          where: { id: existingCommission.id },
          data: {
            amount: totalCommission,
            status: "paid",
            paidAt: new Date(),
          },
        });
      } else {
        await prismaDirect.resellerCommission.create({
          data: {
            resellerId,
            orderId: order.id,
            productId: item.productId,
            amount: totalCommission,
            status: "paid",
            paidAt: new Date(),
          },
        });
      }
    }
  };

  const reverseResellerCommissionsForOrder = async (orderId: string, reason: "cancelled" | "returned" | "delivery_failed") => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, refCode: true },
    });
    if (!order) return;
    const resellerId = await getResellerIdFromOrderRefCode(order.refCode);
    if (!resellerId) return;

    await prismaDirect.resellerCommission.updateMany({
      where: {
        resellerId,
        orderId: order.id,
        status: { in: ["paid", "pending"] },
      },
      data: {
        status: reason,
        paidAt: null,
      },
    });
  };

  const syncResellerSettlementFromShipmentStatus = async (
    orderId: string,
    status: string,
  ) => {
    if (status === "cancelled" || status === "returned" || status === "delivery_failed") {
      await reverseResellerCommissionsForOrder(orderId, status);
      return;
    }

    if (status !== "delivered") {
      return;
    }

    const shipments = await prisma.orderShipment.findMany({
      where: { orderId },
      select: { status: true },
    });
    if (shipments.length === 0) {
      return;
    }

    const allDelivered = shipments.every((shipment) => shipment.status === "delivered");
    if (allDelivered) {
      await settleResellerCommissionsForOrder(orderId);
    }
  };
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const cloudApiKey = process.env.CLOUDINARY_API_KEY;
  const cloudApiSecret = process.env.CLOUDINARY_API_SECRET;
  let cloudinary: any = null;
  if (cloudName && cloudApiKey && cloudApiSecret) {
    cloudinary = (await import("cloudinary")).v2;
    cloudinary.config({
      cloud_name: cloudName,
      api_key: cloudApiKey,
      api_secret: cloudApiSecret,
      secure: true,
    });
  }

  // Email (Nodemailer) basic transport (SMTP or Resend/Sendgrid via SMTP)
  const mailHost = process.env.SMTP_HOST;
  const mailUser = process.env.SMTP_USER;
  const mailPass = process.env.SMTP_PASS;
  const mailFrom = env.SMTP_FROM;
  const resendApiKey = env.RESEND_API_KEY;
  let mailer: any = null;
  if (mailHost && mailUser && mailPass) {
    const nodemailer = (await import("nodemailer")).default;
    mailer = nodemailer.createTransport({
      host: mailHost,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: false,
      auth: { user: mailUser, pass: mailPass },
    });
  }

  // Web Push
  const vapidPublic = process.env.WEB_PUSH_PUBLIC_KEY;
  const vapidPrivate = process.env.WEB_PUSH_PRIVATE_KEY;
  let webpush: any = null;
  if (vapidPublic && vapidPrivate) {
    webpush = (await import("web-push")).default;
    webpush.setVapidDetails("mailto:" + env.NOTIFY_FROM_EMAIL, vapidPublic, vapidPrivate);
  }

  const authenticateToken = createAuthenticateToken(JWT_SECRET);
  const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(String(req.user.role))) {
      return res.sendStatus(403);
    }

    next();
  };

  const normalizePublicRole = (value: unknown): "customer" | "seller" | "reseller" => {
    return value === "seller" || value === "reseller" || value === "customer" ? value : "customer";
  };

  const resolveAuthRole = (
    requestedRole: unknown,
    supabaseUser?: { user_metadata?: Record<string, unknown> | null },
  ): "customer" | "seller" | "reseller" => {
    const metadataRole = supabaseUser?.user_metadata?.role;
    return normalizePublicRole(requestedRole ?? metadataRole);
  };

  const extractSupabaseAvatarUrl = (
    supabaseUser?:
      | {
          user_metadata?: Record<string, unknown> | null;
          raw_user_meta_data?: Record<string, unknown> | null;
          identities?: Array<{ identity_data?: Record<string, unknown> | null } | null> | null;
        }
      | null,
  ): string | null => {
    const metadata = supabaseUser?.user_metadata;
    const rawMetadata = supabaseUser?.raw_user_meta_data;
    const identityMetadata = Array.isArray(supabaseUser?.identities)
      ? supabaseUser.identities
          .map((identity) => identity?.identity_data)
          .filter((value): value is Record<string, unknown> => Boolean(value))
      : [];

    const candidates = [
      metadata?.avatar_url,
      metadata?.picture,
      metadata?.avatar,
      metadata?.photo_url,
      rawMetadata?.avatar_url,
      rawMetadata?.picture,
      rawMetadata?.avatar,
      rawMetadata?.photo_url,
      ...identityMetadata.flatMap((identity) => [
        identity.avatar_url,
        identity.picture,
        identity.avatar,
        identity.photo_url,
      ]),
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) {
        return candidate.trim();
      }
    }

    return null;
  };

  const getRequestIp = (req: any) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0]?.trim();
    }

    return req.ip || req.socket?.remoteAddress || null;
  };

  const getRequestLocation = (req: any) => {
    const country = req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"];
    const city = req.headers["x-vercel-ip-city"];
    if (typeof country === "string" && typeof city === "string" && city) {
      return `${city}, ${country}`;
    }
    if (typeof country === "string" && country) {
      return country;
    }
    return null;
  };

  const getSessionMetadataFromRequest = (req: any) => ({
    ipAddress: getRequestIp(req),
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
    deviceName: typeof req.headers["sec-ch-ua-platform"] === "string" ? req.headers["sec-ch-ua-platform"] : null,
    location: getRequestLocation(req),
  });

  const ensureNotificationPreference = async (userId: string) => {
    return prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  };

  const recordLoginActivity = async (userId: string, sessionId: string, metadata: ReturnType<typeof getSessionMetadataFromRequest>) => {
    await prisma.loginActivity.upsert({
      where: {
        userId_sessionId: {
          userId,
          sessionId,
        },
      },
      update: {
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
        location: metadata.location,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      create: {
        userId,
        sessionId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
        location: metadata.location,
      },
    });
  };

  const markLoginActivitiesRevoked = async (userId: string) => {
    await prisma.loginActivity.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  };

  const handleAuditLog = async (userId: string | null | undefined, action: string, entityType: string, entityId?: string | null, metadata?: Record<string, unknown>) => {
    await prisma.auditLog.create({
      data: {
        userId: userId ? String(userId) : null,
        action,
        entityType,
        entityId: entityId || null,
        metadata: metadata ?? Prisma.JsonNull,
      },
    });
  };

  const getEffectiveTenantId = async (userId: string, explicitTenantId?: string | null) => {
    if (explicitTenantId) {
      return explicitTenantId;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    return user?.tenantId ?? null;
  };

  const ensureEngagementBootstrap = async (userId: string, tenantId?: string | null) => {
    // Supabase pooler connections can be narrow in development and on free tiers.
    // Run the bootstrap work sequentially so login does not trip connection pool timeouts.
    await ensureTenantSetting(tenantId);
    await ensureDefaultMissions(tenantId);
    await ensureDefaultSpinRewards(tenantId);
    await ensureReferralCodeForUser(userId, tenantId);
  };

  const queueEngagementBootstrap = (userId: string, tenantId?: string | null) => {
    void (async () => {
      try {
        await ensureEngagementBootstrap(userId, tenantId);
      } catch (error) {
        logger.warn("auth.engagement_bootstrap_failed", {
          userId,
          tenantId: tenantId ?? null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };

  const runAuthSideEffect = (label: string, task: Promise<unknown>) => {
    void task.catch((error) => {
      logger.warn(`auth.${label}_failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const getActiveAdminUsers = async () =>
    prisma.user.findMany({
      where: {
        role: "admin",
        isBlocked: false,
        deactivatedAt: null,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

  const getSettingsPathForRole = (role: string | null | undefined, section?: string | null) => {
    const base =
      role === "seller"
        ? "/seller/settings"
        : role === "reseller"
          ? "/reseller-dashboard/settings"
          : "/account/settings";

    if (!section) {
      return base;
    }

    return `${base}?section=${encodeURIComponent(section)}`;
  };

  const awardSignupBonus = async (userId: string, tenantId?: string | null) => {
    const settings = await ensureTenantSetting(tenantId);
    await grantReward({
      userId,
      tenantId,
      eventType: "signup_bonus",
      source: "signup_bonus",
      description: "Welcome reward for joining the platform",
      coins: settings?.signupBonusCoins ?? 100,
    });
    await createNotification({
      userId,
      tenantId,
      type: "reward",
      title: "Welcome bonus added",
      message: `Your account is ready and ${(settings?.signupBonusCoins ?? 100).toLocaleString()} reward coins have been added to your rewards balance.`,
      actionUrl: "/account/rewards",
    });
    await updateMissionProgress(userId, "complete-profile", 0);
  };

  const ensureLocalSupabaseUser = async ({
    email,
    preferredName,
    preferredAvatarUrl,
    safeRole,
    confirmedAt,
    authMode,
  }: {
    email: string;
    preferredName: string;
    preferredAvatarUrl?: string | null;
    safeRole: "customer" | "seller" | "reseller" | "admin";
    confirmedAt: string | null;
    authMode: "login" | "register";
  }) => {
    let localUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!localUser) {
      const slugBase = preferredName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || "store";
      localUser = await prisma.user.create({
        data: {
          email,
          name: preferredName,
          avatarUrl: preferredAvatarUrl || null,
          role: safeRole,
          profileVisibility: safeRole === "customer" ? "private" : "public",
          passwordHash: await hashPassword(crypto.randomUUID()),
          emailVerified: Boolean(confirmedAt),
          emailVerifiedAt: confirmedAt ? new Date(confirmedAt) : null,
          tenant: safeRole === "seller" || safeRole === "reseller"
            ? {
                create: {
                  slug: `${slugBase}-${crypto.randomBytes(3).toString("hex")}`,
                  name: `${preferredName}'s workspace`,
                  settings: { create: {} },
                  stores: {
                    create: {
                      name: `${preferredName}'s storefront`,
                      currency: "BDT",
                      locale: "en-BD",
                    },
                  },
                },
              }
            : undefined,
        },
        include: { tenant: true },
      });
      runAuthSideEffect("notification_preference", ensureNotificationPreference(localUser.id));
      if (localUser.tenantId) {
        await prisma.tenantMembership.create({
          data: {
            userId: localUser.id,
            tenantId: localUser.tenantId,
            role: safeRole,
            isPrimary: true,
            acceptedAt: new Date(),
          },
        });
      }
      queueEngagementBootstrap(localUser.id, localUser.tenantId);
      runAuthSideEffect("signup_bonus", awardSignupBonus(localUser.id, localUser.tenantId));
      return localUser;
    }

    if (authMode === "register" && localUser.role !== safeRole) {
      const mismatchError = new Error(
        `This email already belongs to a ${localUser.role} account. Sign in first, then change or upgrade the role from your account flow if needed.`,
      ) as Error & { statusCode?: number };
      mismatchError.statusCode = 409;
      throw mismatchError;
    }

    const shouldPromoteRole =
      authMode !== "register" &&
      localUser.role !== "admin" &&
      localUser.role !== safeRole &&
      (localUser.role === "customer" || safeRole === "customer" ? safeRole !== "customer" : true);
    const shouldUpdateName = !localUser.name && Boolean(preferredName);
    const shouldUpdateAvatar = !localUser.avatarUrl && Boolean(preferredAvatarUrl);
    const shouldVerifyEmail = !localUser.emailVerified && Boolean(confirmedAt);

    if (shouldPromoteRole || shouldUpdateName || shouldUpdateAvatar || shouldVerifyEmail) {
      localUser = await prisma.user.update({
        where: { id: localUser.id },
        data: {
          role: shouldPromoteRole ? safeRole : localUser.role,
          sellerStatus:
            shouldPromoteRole && safeRole === "seller"
              ? SELLER_STATUSES.draft
              : normalizeSellerStatus(localUser.sellerStatus),
          name: localUser.name || preferredName,
          avatarUrl: localUser.avatarUrl || preferredAvatarUrl || null,
          emailVerified: localUser.emailVerified || Boolean(confirmedAt),
          emailVerifiedAt: localUser.emailVerifiedAt || (confirmedAt ? new Date(confirmedAt) : null),
        },
      });
    }

    return localUser;
  };

  const extractSupabaseAuthErrorMessage = (input: unknown): string => {
    if (typeof input === "string") {
      return input.trim();
    }
    if (input && typeof input === "object") {
      const record = input as Record<string, unknown>;
      if (typeof record.code === "string" && record.code.trim()) {
        return record.code.trim();
      }
      if (typeof record.message === "string" && record.message.trim()) {
        return record.message.trim();
      }
      if (typeof record.error === "string" && record.error.trim()) {
        return record.error.trim();
      }
      if (typeof record.error_description === "string" && record.error_description.trim()) {
        return record.error_description.trim();
      }
      if (typeof record.msg === "string" && record.msg.trim()) {
        return record.msg.trim();
      }
    }

    return "";
  };

  const findSupabaseAuthUserByEmail = async (email: string) => {
    if (!supabaseAdmin) {
      return null;
    }

    const normalizedEmail = email.toLowerCase();
    const perPage = 200;

    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        throw error;
      }

      const matchedUser =
        data.users.find((candidate: any) => candidate?.email?.toLowerCase() === normalizedEmail) ?? null;
      if (matchedUser) {
        return matchedUser;
      }

      if (data.users.length < perPage) {
        break;
      }
    }

    return null;
  };

  // API Routes
  app.post("/api/auth/register", rateLimit("register", 10, 60_000), async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email" });
    if (!validatePassword(password)) return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });
    if (!name || name.length < 2) return res.status(400).json({ error: "Name is required" });
    const safeRole = ["customer", "seller", "reseller", "admin"].includes(role) ? role : "customer";

    try {
      const normalizedEmail = email.toLowerCase();
      const hashedPassword = await hashPassword(password);
      const slugBase = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || "store";
      const tenantPayload = safeRole === "seller" || safeRole === "reseller"
        ? {
            create: {
              slug: `${slugBase}-${crypto.randomBytes(3).toString("hex")}`,
              name: `${name}'s workspace`,
              settings: {
                create: {},
              },
              stores: {
                create: {
                  name: `${name}'s storefront`,
                  currency: "BDT",
                  locale: "en-BD",
                },
              },
            },
          }
        : undefined;

      const createdUser = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash: hashedPassword,
          role: safeRole,
          emailVerified: false,
          profileVisibility: safeRole === "customer" ? "private" : "public",
          tenant: tenantPayload,
        },
        include: {
          tenant: true,
        },
      });
      if (createdUser.tenantId) {
        await prisma.tenantMembership.create({
          data: {
            userId: createdUser.id,
            tenantId: createdUser.tenantId,
            role: safeRole,
            isPrimary: true,
            acceptedAt: new Date(),
          },
        });
      }
      runAuthSideEffect("notification_preference", ensureNotificationPreference(createdUser.id));
      queueEngagementBootstrap(createdUser.id, createdUser.tenantId);
      runAuthSideEffect("signup_bonus", awardSignupBonus(createdUser.id, createdUser.tenantId));
      const user = serializeUser(createdUser);

      const { token: verificationToken, expiresAt } = await createVerificationToken(createdUser.id, "email_verifications", 60 * 24);
      await sendEmail(
        normalizedEmail,
        "Verify your LofiMart account",
        `<p>Hello ${name},</p><p>Please verify your email by clicking the link below:</p><p><a href="${env.FRONTEND_URL}/api/auth/verify-email?token=${verificationToken}">Verify email</a></p><p>This link expires at ${new Date(expiresAt).toLocaleString()}.</p>`,
      );

      const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
      runAuthSideEffect("record_login_activity", recordLoginActivity(createdUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
      res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
      res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
      res.json({
        user,
        token: sessionResult.accessToken,
        refreshToken: sessionResult.refreshToken,
        refreshExpiresAt: sessionResult.expiresAt,
        emailVerificationToken: process.env.NODE_ENV === "production" ? undefined : verificationToken,
        emailVerificationExpiresAt: expiresAt,
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        res.status(400).json({ error: "Email already exists" });
      } else {
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  app.post("/api/auth/login", rateLimit("login", 20, 60_000), async (req, res) => {
    const { email, password } = req.body;
    const normalizedEmail = typeof email === "string" ? email.toLowerCase() : "";
    const user = normalizedEmail
      ? await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })
      : null;

    const MAX_ATTEMPTS = 5;
    const LOCK_WINDOW = 15 * 60 * 1000; // 15m
    const lockKey = `login-lock-${normalizedEmail}`;
    const attemptsKey = `login-attempts-${normalizedEmail}`;

    const now = Date.now();
    const lock = rateLimits[lockKey];
    if (lock && lock.timestamps[0] && now - lock.timestamps[0] < LOCK_WINDOW) {
      return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    }

    const passwordOk = user && (await bcrypt.compare(password, user.passwordHash));
    if (!user || !passwordOk) {
      const bucket = rateLimits[attemptsKey] || { timestamps: [] };
      bucket.timestamps = bucket.timestamps.filter((t) => now - t < LOCK_WINDOW);
      bucket.timestamps.push(now);
      rateLimits[attemptsKey] = bucket;
      if (bucket.timestamps.length >= MAX_ATTEMPTS) {
        rateLimits[lockKey] = { timestamps: [now] };
        rateLimits[attemptsKey] = { timestamps: [] };
      }
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // success: clear attempt bucket
    delete rateLimits[attemptsKey];
    delete rateLimits[lockKey];
    if (!user.emailVerified) {
      return res.status(403).json({ error: "Email not verified", requiresVerification: true });
    }

    if (user.isBlocked || user.deactivatedAt) {
      return res.status(403).json({ error: "This account is not currently allowed to sign in" });
    }

    queueEngagementBootstrap(user.id, user.tenantId);
    const userWithoutPassword = serializeUser(user);
    const sessionResult = await createSession(userWithoutPassword, getSessionMetadataFromRequest(req));
    runAuthSideEffect("record_login_activity", recordLoginActivity(user.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
    runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(user.id, user.tenantId));
    res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(userWithoutPassword));
    res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(userWithoutPassword));
    res.json({ user: userWithoutPassword, token: sessionResult.accessToken, refreshToken: sessionResult.refreshToken, refreshExpiresAt: sessionResult.expiresAt });
  });

  app.post("/api/auth/supabase/exchange", rateLimit("supabase-exchange", 30, 60_000), async (req: any, res: any) => {
    try {
      const { accessToken, role, name, mode } = req.body ?? {};
      if (!accessToken || !supabaseAuth) {
        return res.status(400).json({ error: "Supabase auth is not configured" });
      }

      const { data, error } = await supabaseAuth.auth.getUser(String(accessToken));
      if (error || !data.user?.email) {
        return res.status(401).json({ error: "Invalid Supabase session" });
      }

      const supabaseUser = data.user;
      if (!supabaseUser.email) {
        return res.status(400).json({ error: 'Supabase user email is missing' });
      }
      const normalizedEmail = supabaseUser.email.toLowerCase();
      const confirmedAt = (supabaseUser as any).email_confirmed_at || (supabaseUser as any).confirmed_at || null;
      const authMode = mode === 'register' ? 'register' : 'login';
      const safeRole = resolveAuthRole(role, supabaseUser as any);
      const preferredName =
        name ||
        (supabaseUser.user_metadata?.name as string | undefined) ||
        (supabaseUser.user_metadata?.full_name as string | undefined) ||
        normalizedEmail.split("@")[0];
      const localUser = await ensureLocalSupabaseUser({
        email: normalizedEmail,
        preferredName,
        preferredAvatarUrl: extractSupabaseAvatarUrl(supabaseUser as any),
        safeRole,
        confirmedAt,
        authMode,
      });

      if (localUser.isBlocked || localUser.deactivatedAt) {
        return res.status(403).json({ error: "This account is not currently allowed to sign in" });
      }

      queueEngagementBootstrap(localUser.id, localUser.tenantId);
      const user = serializeUser(localUser);
      const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
      runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
      runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
      res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
      res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
      res.json({ user, token: sessionResult.accessToken, refreshToken: sessionResult.refreshToken, refreshExpiresAt: sessionResult.expiresAt });
    } catch (error) {
      logServerError("supabase auth exchange", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to complete sign-in" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try signing in again in a moment." });
      }
      return res.status(500).json({ error: "Failed to complete sign-in" });
    }
  });

  app.post("/api/auth/supabase/provision", rateLimit("supabase-provision", 20, 60_000), async (req: any, res: any) => {
    try {
      const { supabaseUserId, email, role, name } = req.body ?? {};
      if (!supabaseUserId || !supabaseAdmin || !supabaseUrl) {
        return res.status(400).json({ error: "Supabase provisioning is not configured" });
      }

      const { data, error } = await supabaseAdmin.auth.admin.getUserById(String(supabaseUserId));
      if (error || !data.user?.email) {
        return res.status(401).json({ error: "Unable to verify the newly created account" });
      }

      const normalizedEmail = data.user.email.toLowerCase();
      if (typeof email === "string" && email.toLowerCase() !== normalizedEmail) {
        return res.status(400).json({ error: "Registration email mismatch detected" });
      }

      const confirmedAt = (data.user as any).email_confirmed_at || (data.user as any).confirmed_at || null;
      const safeRole = resolveAuthRole(role, data.user as any);
      const preferredName =
        name ||
        (data.user.user_metadata?.name as string | undefined) ||
        (data.user.user_metadata?.full_name as string | undefined) ||
        normalizedEmail.split("@")[0];

      await ensureLocalSupabaseUser({
        email: normalizedEmail,
        preferredName,
        preferredAvatarUrl: extractSupabaseAvatarUrl(data.user as any),
        safeRole,
        confirmedAt,
        authMode: "register",
      });

      return res.json({ success: true });
    } catch (error) {
      logServerError("supabase auth provision", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to provision account" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try again in a moment." });
      }
      return res.status(500).json({ error: "Failed to provision account" });
    }
  });

  app.post("/api/auth/supabase/recover-register", rateLimit("supabase-recover-register", 10, 60_000), async (req: any, res: any) => {
    try {
      const { email, role, name } = req.body ?? {};
      if (!email || typeof email !== "string" || !supabaseAdmin) {
        return res.status(400).json({ error: "Supabase recovery is not configured" });
      }

      const recoveredUser = await findSupabaseAuthUserByEmail(email);
      if (!recoveredUser?.email) {
        return res.status(404).json({ error: "No matching Supabase account was found yet" });
      }

      const normalizedEmail = recoveredUser.email.toLowerCase();
      const confirmedAt = (recoveredUser as any).email_confirmed_at || (recoveredUser as any).confirmed_at || null;
      const safeRole = resolveAuthRole(role, recoveredUser as any);
      const preferredName =
        name ||
        (recoveredUser.user_metadata?.name as string | undefined) ||
        (recoveredUser.user_metadata?.full_name as string | undefined) ||
        normalizedEmail.split("@")[0];

      await ensureLocalSupabaseUser({
        email: normalizedEmail,
        preferredName,
        preferredAvatarUrl: extractSupabaseAvatarUrl(recoveredUser as any),
        safeRole,
        confirmedAt,
        authMode: "register",
      });

      return res.json({
        success: true,
        requiresVerification: !confirmedAt,
      });
    } catch (error) {
      logServerError("supabase register recovery", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to recover account registration" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try again in a moment." });
      }
      return res.status(500).json({ error: "Failed to recover account registration" });
    }
  });

  app.post("/api/auth/supabase/register", rateLimit("supabase-register", 10, 60_000), async (req: any, res: any) => {
    try {
      const { email, password, role, name, referralCode, redirectTo } = req.body ?? {};

      if (!supabaseUrl || !supabasePublishableKey || !supabaseAdmin) {
        return res.status(400).json({ error: "Supabase registration is not configured" });
      }
      if (!validateEmail(email)) {
        return res.status(400).json({ error: "Invalid email" });
      }
      if (!validatePassword(password)) {
        return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });
      }
      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: "Name is required" });
      }

      const safeRole = normalizePublicRole(role);
      const normalizedEmail = String(email).toLowerCase();
      const callbackUrl =
        typeof redirectTo === "string" && redirectTo.startsWith("http")
          ? redirectTo
          : `${env.FRONTEND_URL}/login`;

      const signupResponse = await fetch(
        `${supabaseUrl}/auth/v1/signup?redirect_to=${encodeURIComponent(callbackUrl)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabasePublishableKey,
            Authorization: `Bearer ${supabasePublishableKey}`,
          },
          body: JSON.stringify({
            email: normalizedEmail,
            password,
            data: {
              name: String(name).trim(),
              role: safeRole,
              referralCode: typeof referralCode === "string" && referralCode.trim() ? referralCode.trim() : undefined,
            },
          }),
        },
      );

      const payload = (await signupResponse.json().catch(() => null)) as any;

      if (!signupResponse.ok) {
        const supabaseError =
          extractSupabaseAuthErrorMessage(payload) ||
          (signupResponse.status === 504
            ? "The authentication service took too long to respond. Please wait a moment and try again."
            : "Supabase registration failed");
        const isRetryableSignupFailure =
          signupResponse.status >= 500 ||
          signupResponse.status === 504 ||
          /email rate limit exceeded/i.test(String(supabaseError)) ||
          /over_email_send_rate_limit/i.test(String(supabaseError));
        const recoveredUser = isRetryableSignupFailure
          ? await findSupabaseAuthUserByEmail(normalizedEmail)
          : null;

        if (recoveredUser?.email) {
          const confirmedAt = (recoveredUser as any).email_confirmed_at || (recoveredUser as any).confirmed_at || null;
          const localUser = await ensureLocalSupabaseUser({
            email: recoveredUser.email.toLowerCase(),
            preferredName:
              String(name).trim() ||
              (recoveredUser.user_metadata?.name as string | undefined) ||
              (recoveredUser.user_metadata?.full_name as string | undefined) ||
              recoveredUser.email.split("@")[0],
            preferredAvatarUrl: extractSupabaseAvatarUrl(recoveredUser as any),
            safeRole,
            confirmedAt,
            authMode: "register",
          });

          return res.json({
            success: true,
            recovered: true,
            requiresVerification: !confirmedAt,
            user: serializeUser(localUser),
          });
        }

        if (isRetryableSignupFailure) {
          const { data: createdByAdmin, error: createByAdminError } = await supabaseAdmin.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: {
              name: String(name).trim(),
              role: safeRole,
              referralCode: typeof referralCode === "string" && referralCode.trim() ? referralCode.trim() : undefined,
            },
          } as any);

          if (!createByAdminError && createdByAdmin?.user?.email) {
            const confirmedAt =
              (createdByAdmin.user as any).email_confirmed_at ||
              (createdByAdmin.user as any).confirmed_at ||
              new Date().toISOString();
            const localUser = await ensureLocalSupabaseUser({
              email: createdByAdmin.user.email.toLowerCase(),
              preferredName:
                String(name).trim() ||
                (createdByAdmin.user.user_metadata?.name as string | undefined) ||
                (createdByAdmin.user.user_metadata?.full_name as string | undefined) ||
                createdByAdmin.user.email.split("@")[0],
              preferredAvatarUrl: extractSupabaseAvatarUrl(createdByAdmin.user as any),
              safeRole,
              confirmedAt,
              authMode: "register",
            });

            const user = serializeUser(localUser);
            const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
            runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
            runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
            res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
            res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
            return res.json({
              success: true,
              recovered: true,
              fallback: "admin-create-user",
              requiresVerification: false,
              user,
              token: sessionResult.accessToken,
              refreshToken: sessionResult.refreshToken,
              refreshExpiresAt: sessionResult.expiresAt,
            });
          }

          if (createByAdminError) {
            const lateRecoveredUser = await findSupabaseAuthUserByEmail(normalizedEmail);
            if (lateRecoveredUser?.email) {
              const confirmedAt =
                (lateRecoveredUser as any).email_confirmed_at ||
                (lateRecoveredUser as any).confirmed_at ||
                new Date().toISOString();
              const localUser = await ensureLocalSupabaseUser({
                email: lateRecoveredUser.email.toLowerCase(),
                preferredName:
                  String(name).trim() ||
                  (lateRecoveredUser.user_metadata?.name as string | undefined) ||
                  (lateRecoveredUser.user_metadata?.full_name as string | undefined) ||
                  lateRecoveredUser.email.split("@")[0],
                preferredAvatarUrl: extractSupabaseAvatarUrl(lateRecoveredUser as any),
                safeRole,
                confirmedAt,
                authMode: "register",
              });

              const user = serializeUser(localUser);
              const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
              runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
              runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
              res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
              res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
              return res.json({
                success: true,
                recovered: true,
                fallback: "late-recover-existing-user",
                requiresVerification: false,
                user,
                token: sessionResult.accessToken,
                refreshToken: sessionResult.refreshToken,
                refreshExpiresAt: sessionResult.expiresAt,
              });
            }
          }
        }

        const statusCode =
          signupResponse.status === 429
            ? 429
            : /already/i.test(String(supabaseError))
              ? 409
              : signupResponse.status >= 400 && signupResponse.status < 600
                ? signupResponse.status
                : 500;
        return res.status(statusCode).json({ error: supabaseError });
      }

      const supabaseUser = payload?.user;
      if (!supabaseUser?.email) {
        return res.status(500).json({ error: "Supabase did not return the created user" });
      }

      const confirmedAt = (supabaseUser as any).email_confirmed_at || (supabaseUser as any).confirmed_at || null;
      const localUser = await ensureLocalSupabaseUser({
        email: supabaseUser.email.toLowerCase(),
        preferredName:
          String(name).trim() ||
          (supabaseUser.user_metadata?.name as string | undefined) ||
          (supabaseUser.user_metadata?.full_name as string | undefined) ||
          supabaseUser.email.split("@")[0],
        preferredAvatarUrl: extractSupabaseAvatarUrl(supabaseUser as any),
        safeRole,
        confirmedAt,
        authMode: "register",
      });

      if (payload?.session?.access_token && confirmedAt) {
        const user = serializeUser(localUser);
        const sessionResult = await createSession(user, getSessionMetadataFromRequest(req));
        runAuthSideEffect("record_login_activity", recordLoginActivity(localUser.id, sessionResult.session.sid, getSessionMetadataFromRequest(req)));
        runAuthSideEffect("claim_daily_login_reward", claimDailyLoginReward(localUser.id, localUser.tenantId));
        res.cookie("access_token", sessionResult.accessToken, getAccessCookieOptions(user));
        res.cookie("refresh_token", sessionResult.refreshToken, getRefreshCookieOptions(user));
        return res.json({
          success: true,
          user,
          token: sessionResult.accessToken,
          refreshToken: sessionResult.refreshToken,
          refreshExpiresAt: sessionResult.expiresAt,
          requiresVerification: false,
        });
      }

      return res.json({
        success: true,
        requiresVerification: !confirmedAt,
        user: serializeUser(localUser),
      });
    } catch (error) {
      logServerError("supabase register", error);
      const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : null;
      if (statusCode) {
        return res.status(statusCode).json({ error: (error as any)?.message || "Failed to register with Supabase" });
      }
      if (isDatabaseUnavailableError(error)) {
        return res.status(503).json({ error: "Database is busy right now. Please try again in a moment." });
      }
      return res.status(500).json({ error: "Failed to register with Supabase" });
    }
  });

  app.post("/api/auth/refresh", rateLimit("refresh", 40, 60_000), async (req: any, res: any) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Missing refreshToken" });

    const rotatedSession = await rotateSession(refreshToken);
    if (!rotatedSession) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    res.cookie("access_token", rotatedSession.accessToken, getAccessCookieOptions(rotatedSession.session.user));
    res.cookie("refresh_token", rotatedSession.refreshToken, getRefreshCookieOptions(rotatedSession.session.user));
    res.json({
      token: rotatedSession.accessToken,
      refreshToken: rotatedSession.refreshToken,
      refreshExpiresAt: rotatedSession.expiresAt,
    });
  });

  app.post("/api/auth/change-password", authenticateToken, async (req: any, res: any) => {
    const { currentPassword, newPassword } = req.body;
    if (!validatePassword(newPassword)) return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });

    const user = await prisma.user.findUnique({ where: { id: String(req.user.id) } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed },
    });
    await revokeAllSessionsForUser(req.user.id);
    await markLoginActivitiesRevoked(String(req.user.id));
    res.json({ success: true });
  });

  app.post("/api/auth/request-reset", rateLimit("request-reset", 10, 60_000), async (req: any, res: any) => {
    const { email } = req.body;
    if (!validateEmail(email)) return res.status(400).json({ error: "Invalid email" });
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (user) {
      const { token, expiresAt } = await createVerificationToken(user.id, "password_resets", 30);
      await sendEmail(
        email.toLowerCase(),
        "Reset your LofiMart password",
        `<p>We received a request to reset your password.</p><p>Use this token: <strong>${token}</strong></p><p>Or open the reset page and submit it there. This token expires at ${new Date(expiresAt).toLocaleString()}.</p>`,
      );
      res.json({ success: true, resetToken: process.env.NODE_ENV === "production" ? undefined : token, expiresAt });
    } else {
      res.json({ success: true });
    }
  });

  app.post("/api/auth/reset-password", rateLimit("reset-password", 20, 60_000), async (req: any, res: any) => {
    const { token, newPassword } = req.body;
    if (!validatePassword(newPassword)) return res.status(400).json({ error: "Password must be at least 8 characters with letters and numbers" });
    const record = await prisma.passwordResetToken.findUnique({
      where: { token },
    });
    if (!record || record.used) return res.status(400).json({ error: "Invalid or used token" });
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "This reset link has expired. Please request a new one.", code: "TOKEN_EXPIRED" });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: hashed },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);
    await revokeAllSessionsForUser(record.userId);
    await markLoginActivitiesRevoked(String(record.userId));
    res.json({ success: true });
  });

  app.get("/api/auth/sessions", authenticateToken, async (req: any, res: any) => {
    const [sessions, activities] = await Promise.all([
      listSessionsForUser(req.user.id),
      prisma.loginActivity.findMany({
        where: { userId: String(req.user.id) },
        orderBy: { loggedInAt: "desc" },
      }),
    ]);

    const activityBySession = new Map(activities.map((activity) => [activity.sessionId, activity]));

    res.json(
      sessions.map((session) => ({
        session_id: session.sid,
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        device_name: session.deviceName ?? activityBySession.get(session.sid)?.deviceName ?? null,
        ip_address: session.ipAddress ?? activityBySession.get(session.sid)?.ipAddress ?? null,
        user_agent: session.userAgent ?? activityBySession.get(session.sid)?.userAgent ?? null,
        location: session.location ?? activityBySession.get(session.sid)?.location ?? null,
      })),
    );
  });

  app.post("/api/auth/logout-all", authenticateToken, async (req: any, res: any) => {
    await revokeAllSessionsForUser(req.user.id);
    await markLoginActivitiesRevoked(String(req.user.id));
    res.clearCookie("access_token", getAccessCookieOptions());
    res.clearCookie("refresh_token", getRefreshCookieOptions());
    res.json({ success: true });
  });

  app.post("/api/auth/send-verification", authenticateToken, rateLimit("send-verification", 5, 60_000), async (req: any, res: any) => {
    const user = await prisma.user.findUnique({ where: { id: String(req.user.id) } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.emailVerified) return res.json({ success: true, message: "Already verified" });
    const { token, expiresAt } = await createVerificationToken(user.id, "email_verifications", 60 * 24);
    await sendEmail(
      user.email,
      "Verify your LofiMart account",
      `<p>Hello ${user.name || "there"},</p><p>Please verify your email by clicking the link below:</p><p><a href="${env.FRONTEND_URL}/api/auth/verify-email?token=${token}">Verify email</a></p><p>This link expires at ${new Date(expiresAt).toLocaleString()}.</p>`,
    );
    res.json({ success: true, verificationToken: process.env.NODE_ENV === "production" ? undefined : token, expiresAt });
  });

  app.post("/api/auth/send-phone-verification", authenticateToken, rateLimit("send-phone-verification", 5, 60_000), async (req: any, res: any) => {
    const user = await prisma.user.findUnique({ where: { id: String(req.user.id) } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.phone) return res.status(400).json({ error: "Add a phone number before requesting verification" });
    if (user.phoneVerified) return res.json({ success: true, message: "Phone already verified" });

    const { token, expiresAt } = await createVerificationToken(user.id, "phone_verifications", 10);
    const otp = token.replace(/-/g, "").slice(0, 6).toUpperCase();

    res.json({
      success: true,
      expiresAt,
      phoneVerificationCode: process.env.NODE_ENV === "production" ? undefined : otp,
    });
  });

  app.post("/api/auth/verify-phone", authenticateToken, rateLimit("verify-phone", 10, 60_000), async (req: any, res: any) => {
    const submittedCode = String(req.body?.code || "").trim().toUpperCase();
    if (!submittedCode || submittedCode.length < 6) {
      return res.status(400).json({ error: "A valid verification code is required" });
    }

    const records = await prisma.phoneVerificationToken.findMany({
      where: {
        userId: String(req.user.id),
        used: false,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const matchingRecord = records.find((record) => record.token.replace(/-/g, "").slice(0, 6).toUpperCase() === submittedCode);
    if (!matchingRecord) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    if (new Date(matchingRecord.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: "Verification code expired" });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: String(req.user.id) },
        data: {
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
        },
      }),
      prisma.phoneVerificationToken.update({
        where: { id: matchingRecord.id },
        data: { used: true },
      }),
    ]);

    res.json({ success: true });
  });

  app.get("/api/auth/verify-email", rateLimit("verify-email", 20, 60_000), async (req: any, res: any) => {
    const token = req.query.token as string;
    if (!token) return res.status(400).send("Missing token");
    const record = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });
    if (!record || record.used) return res.status(400).send("Invalid or used token");
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return res.status(400).send("This verification link has expired. Please request a new one.");
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { used: true },
      }),
    ]);
    res.send("Email verified. You can close this tab.");
  });

  app.post("/api/auth/logout", async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeSessionByRefreshToken(refreshToken);
    }
    res.clearCookie("access_token", { path: "/" });
    res.clearCookie("refresh_token", { path: "/" });
    res.json({ success: true });
  });

  // ============ PAYMENTS: STRIPE ============
  app.post("/api/payments/create-intent", authenticateToken, async (req: any, res: any) => {
    try {
      if (!(await isCheckoutPaymentMethodEnabled("gateway"))) {
        return res.status(403).json({ error: "Online gateway payments are temporarily disabled." });
      }
      if (!stripe) return res.status(500).json({ error: "Stripe not configured" });
      const { orderId, currency = "usd" } = req.body;
      const order = await prisma.order.findFirst({
        where: {
          id: String(orderId),
          userId: String(req.user.id),
        },
      });
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.paymentStatus === "paid") return res.json({ clientSecret: null, status: "paid" });

      const intent = await stripe.paymentIntents.create({
        amount: Math.round(Number(order.total) * 100),
        currency,
        metadata: { orderId: String(order.id), userId: String(req.user.id) },
        automatic_payment_methods: { enabled: true },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentProvider: "stripe",
          paymentIntentId: intent.id,
          paymentStatus: "requires_payment",
        },
      });

      void enqueuePaymentProcessing({
        paymentId: intent.id,
        provider: "stripe",
        orderId: String(order.id),
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
      });

      res.json({ clientSecret: intent.client_secret, intentId: intent.id });
    } catch (err: any) {
      logServerError("stripe create-intent", err, {
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
      });
      res.status(500).json({ error: "Failed to create payment intent" });
    }
  });

  app.post("/api/payments/webhook/stripe", express.raw({ type: "application/json" }), async (req: any, res: any) => {
    if (!stripe) return res.status(500).end();
    const sig = req.headers["stripe-signature"];
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET || "");
    } catch (err: any) {
      const message = getErrorMessage(err);
      logServerError("stripe webhook signature", err);
      return res.status(400).send(`Webhook Error: ${message}`);
    }

    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        const updatedOrder = await prisma.order.update({
          where: { id: String(orderId) },
          data: {
            paymentStatus: "paid",
            status: "processing",
            paidAt: new Date(),
            failureReason: null,
          },
          select: {
            id: true,
            userId: true,
            tenantId: true,
            total: true,
          },
        });

        await postAccountingEntrySafe({
          reference: `PAYMENT-${updatedOrder.id}-${pi.id}`,
          memo: `Stripe payment captured for order ${updatedOrder.id}`,
          currency: String(pi.currency || 'BDT').toUpperCase(),
          lines: [
            {
              accountCode: '1010',
              debit: Number(updatedOrder.total || 0),
              description: `Stripe clearing for order ${updatedOrder.id}`,
            },
            {
              accountCode: '4000',
              credit: Number(updatedOrder.total || 0),
              description: `Product revenue for order ${updatedOrder.id}`,
            },
          ],
        });

        await createNotification({
          userId: updatedOrder.userId,
          tenantId: updatedOrder.tenantId ?? null,
          type: "order_update",
          title: "Payment received",
          message: `Payment for order ${updatedOrder.id} was received successfully.`,
          actionUrl: `/order-success?orderId=${updatedOrder.id}`,
          metadata: {
            orderId: updatedOrder.id,
            paymentIntentId: pi.id,
            paymentStatus: "paid",
          },
        });

        void enqueueNotification({
          userId: String(pi.metadata?.userId || "unknown"),
          channel: "in-app",
          message: `Payment received for order ${orderId}`,
        });
        void enqueueEmail({
          to: "ops@local.invalid",
          subject: "Payment received",
          template: "payment-completed",
          payload: { orderId, paymentId: pi.id },
        });
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        const failureReason = pi.last_payment_error?.message || "Payment failed";
        const updatedOrder = await prisma.order.update({
          where: { id: String(orderId) },
          data: {
            paymentStatus: "failed",
            status: "payment_failed",
            failureReason,
          },
          select: {
            id: true,
            userId: true,
            tenantId: true,
          },
        });

        await createNotification({
          userId: updatedOrder.userId,
          tenantId: updatedOrder.tenantId ?? null,
          type: "order_update",
          title: "Payment failed",
          message: `${failureReason}. You can retry checkout for order ${updatedOrder.id}.`,
          actionUrl: "/checkout",
          metadata: {
            orderId: updatedOrder.id,
            paymentIntentId: pi.id,
            paymentStatus: "failed",
          },
        });

        const admins = await getActiveAdminUsers();
        await Promise.all(
          admins.map((admin) =>
            createNotification({
              userId: admin.id,
              tenantId: updatedOrder.tenantId ?? null,
              type: "payout",
              title: "Payment failure detected",
              message: `Order ${updatedOrder.id} encountered a payment failure and may need customer support follow-up.`,
              actionUrl: `/admin/payments?search=${encodeURIComponent(updatedOrder.id)}`,
              metadata: {
                orderId: updatedOrder.id,
                paymentIntentId: pi.id,
                paymentStatus: "failed",
                failureReason,
              },
            }),
          ),
        );
      }
    }

    res.json({ received: true });
  });

// ============ CART ENDPOINTS ============
  app.get('/api/cart', authenticateToken, async (req: any, res) => {
    const redis = await ensureRedis();
    const raw = await redis.get(userCartKey(req.user.id));
    const items = raw ? JSON.parse(raw) : [];
    res.json({ items });
  });

  app.put('/api/cart', authenticateToken, async (req: any, res) => {
    const { items } = req.body;
    const redis = await ensureRedis();
    const cartRecoveryQueue = await getQueue(QUEUE_NAMES.cartRecovery);
    await cartRecoveryQueue.remove(cartRecoveryJobId(req.user.id)).catch(() => undefined);

    if (Array.isArray(items) && items.length > 0) {
      await redis.set(userCartKey(req.user.id), JSON.stringify(items), 'EX', env.SESSION_TTL_SECONDS);
    } else {
      await redis.del(userCartKey(req.user.id));
    }

    res.json({ success: true });
  });

  app.post('/api/cart/recovery/schedule', authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    const settings = await ensureTenantSetting(tenantId);
    const delayMins = settings?.cartRecoveryDelayMins ?? 120;
    const queue = await getQueue(QUEUE_NAMES.cartRecovery);
    await queue.remove(cartRecoveryJobId(userId)).catch(() => undefined);

    await enqueueCartRecovery({
      userId,
      email: String(req.user.email),
      name: typeof req.user.name === 'string' ? req.user.name : null,
      tenantId,
      cartKey: userCartKey(userId),
      cartRecoveryDelayMins: delayMins,
    });

    res.json({ success: true, scheduled_in_minutes: delayMins });
  });

  app.post('/api/cart/recovery/cancel', authenticateToken, async (req: any, res) => {
    const queue = await getQueue(QUEUE_NAMES.cartRecovery);
    await queue.remove(cartRecoveryJobId(req.user.id)).catch(() => undefined);
    res.json({ success: true });
  });

  // ============ NOTIFICATIONS ============
  app.post("/api/notifications/subscribe", authenticateToken, async (req: any, res: any) => {
    if (!webpush) return res.status(500).json({ error: "Push not configured" });
    const sub = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: "Invalid subscription" });
    await prismaDirect.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: {
        userId: String(req.user.id),
        data: sub,
      },
      create: {
        userId: String(req.user.id),
        endpoint: sub.endpoint,
        data: sub,
      },
    });
    res.json({ success: true });
  });

  const notifyOrderPlaced = async (userId: number | string, orderId: number | string, total: number) => {
    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { email: true, notificationPreference: true },
    });
    const html = `<p>Your order #${orderId} has been placed.</p><p>Total: ${total}</p>`;
    const allowsOrderUpdates = user?.notificationPreference?.orderUpdates ?? true;
    const allowsEmail = user?.notificationPreference?.emailEnabled ?? true;

    if (allowsOrderUpdates && allowsEmail && user?.email) {
      await sendEmail(user.email, "Order placed", html);
    }

    if (webpush && allowsOrderUpdates) {
      const subs = await prismaDirect.pushSubscription.findMany({
        where: { userId: String(userId) },
        select: { data: true },
      });

      for (const s of subs) {
        try {
          await webpush.sendNotification(s.data, JSON.stringify({ title: "Order placed", body: `Order #${orderId} total ${total}` }));
        } catch (err) {
          console.error("Push send error", err);
        }
      }
    }
  };

  // ============ MEDIA UPLOADS: CLOUDINARY ============
  app.post("/api/media/signature", authenticateToken, (req: any, res: any) => {
    if (!cloudinary) return res.status(500).json({ error: "Cloudinary not configured" });
    // Only admin/seller allowed to upload product assets
    if (!["admin", "seller"].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request({ timestamp }, cloudApiSecret);
    res.json({ cloudName, apiKey: cloudApiKey, timestamp, signature });
  });

  app.post("/api/media/attach", authenticateToken, async (req: any, res: any) => {
    const { productId, urls } = req.body;
    if (!["admin", "seller"].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });
    if (!productId || !urls || !Array.isArray(urls)) return res.status(400).json({ error: "productId and urls[] required" });

    try {
      const product = await prisma.product.findUnique({
        where: { id: String(productId) },
        select: { id: true, sellerId: true },
      });
      if (!product) return res.status(404).json({ error: "Product not found" });
      if (req.user.role === "seller" && product.sellerId !== String(req.user.id)) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      // put primary image as first
      const primary = urls[0];
      await prisma.product.update({
        where: { id: String(productId) },
        data: { image: primary },
      });
      await invalidateProductCache(String(productId));
      res.json({ success: true, primary });
    } catch (err) {
      console.error("attach media error", err);
      res.status(500).json({ error: "Failed to attach images" });
    }
  });

  app.get("/api/sellers/:id", async (req, res) => {
    const seller = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        role: { in: ['seller', 'reseller'] },
        profileVisibility: { not: 'private' },
      },
      include: {
        verificationSubmission: true,
      },
    });
    if (!seller) return res.status(404).json({ error: "Seller not found" });

    if (seller.role === "seller" && !isSellerApproved(seller.sellerStatus)) {
      return res.status(423).json({
        error: "Store is under review.",
        seller_status: normalizeSellerStatus(seller.sellerStatus),
      });
    }

    const products = await prisma.product.findMany({
      where: seller.role === "seller"
        ? getPublicPublishedProductWhere({ sellerId: req.params.id })
        : { sellerId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          select: { id: true, name: true },
        },
      },
    });
    const averageRating = products.length
      ? products.reduce((sum, product) => sum + (product.rating || 0), 0) / products.length
      : 0;
    res.json({
      seller: {
        id: seller.id,
        name: seller.name,
        email: seller.email,
        avatar_url: seller.avatarUrl ?? null,
        bio: seller.bio ?? null,
        store_name: seller.storeName ?? seller.name,
        storefront_slug: seller.storefrontSlug ?? null,
        storefront_banner_url: seller.storefrontBannerUrl ?? null,
        storefront_headline: seller.storefrontHeadline ?? null,
        storefront_accent_color: seller.storefrontAccentColor ?? null,
        storefront_custom_domain: seller.storefrontCustomDomain ?? null,
        response_time_hours: seller.responseTimeHours ?? null,
        verification_status: seller.verificationSubmission?.status ?? null,
        verification_badge: seller.verificationSubmission?.status === "verified",
        seller_rating: Number(averageRating.toFixed(1)),
        created_at: seller.createdAt.toISOString(),
      },
      products: products.map(serializeProduct),
    });
  });

  app.get("/api/storefronts/:slug", async (req, res) => {
    const slug = normalizeStorefrontSlug(String(req.params.slug || ""));
    if (!slug) {
      return res.status(400).json({ error: "Storefront slug is required." });
    }

    const seller = await prisma.user.findFirst({
      where: {
        role: "seller",
        storefrontSlug: slug,
        profileVisibility: { not: "private" },
      },
      include: {
        verificationSubmission: true,
      },
    });

    if (!seller) {
      return res.status(404).json({ error: "Seller storefront not found." });
    }

    if (!isSellerApproved(seller.sellerStatus) || !Boolean(seller.storefrontPublished)) {
      return res.status(423).json({
        error: "Store is under review.",
        seller_status: normalizeSellerStatus(seller.sellerStatus),
        storefront: {
          seller_id: seller.id,
          store_name: seller.storeName || seller.name,
          slug: seller.storefrontSlug,
        },
      });
    }

    const now = new Date();
    const [products, flashSaleEntries, coupons] = await Promise.all([
      prisma.product.findMany({
        where: getPublicPublishedProductWhere({ sellerId: seller.id }),
        orderBy: { createdAt: "desc" },
        include: {
          seller: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.flashSaleEntry.findMany({
        where: {
          sellerId: seller.id,
          status: "approved",
          campaign: {
            status: "live",
            startsAt: { lte: now },
            endsAt: { gte: now },
          },
        },
        include: {
          product: {
            include: {
              seller: { select: { id: true, name: true } },
            },
          },
          campaign: true,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.coupon.findMany({
        where: {
          sellerId: seller.id,
          expiryDate: { gte: now },
        },
        orderBy: { expiryDate: "asc" },
        take: 6,
      }),
    ]);

    const averageRating = products.length
      ? products.reduce((sum, product) => sum + (product.rating || 0), 0) / products.length
      : 0;

    const categories = [...new Set(products.map((product) => String(product.category || "").trim()).filter(Boolean))];

    res.json({
      storefront: {
        seller_id: seller.id,
        seller_name: seller.name,
        store_name: seller.storeName || seller.name,
        slug: seller.storefrontSlug,
        banner_url: seller.storefrontBannerUrl || null,
        headline: seller.storefrontHeadline || null,
        accent_color: seller.storefrontAccentColor || "#0F766E",
        custom_domain: seller.storefrontCustomDomain || null,
        avatar_url: seller.avatarUrl || null,
        bio: seller.bio || null,
        response_time_hours: seller.responseTimeHours ?? null,
        verification_badge: seller.verificationSubmission?.status === "verified",
        seller_rating: Number(averageRating.toFixed(1)),
      },
      categories,
      coupons: coupons.map(serializeCoupon),
      products: products.map(serializeProduct),
      flash_sale_entries: flashSaleEntries.map((entry) => ({
        id: entry.id,
        sale_price: toPlainNumber(entry.salePrice),
        allocated_stock: entry.allocatedStock,
        product: serializeProduct(entry.product),
        campaign: {
          id: entry.campaign.id,
          title: entry.campaign.title,
          slug: entry.campaign.slug,
          banner_image: entry.campaign.bannerImage ?? null,
          ends_at: entry.campaign.endsAt.toISOString(),
        },
      })),
    });
  });

  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await prisma.category.findMany({
        orderBy: { name: "asc" },
      });
      res.json(categories.map(serializeCategory));
    } catch (error) {
      console.error("[api/categories] fallback:", error);
      res.json([]);
    }
  });

  app.get("/api/shop-page", async (req, res) => {
    const payload = await getOrSetCache(
      "shop:page",
      async () => {
        const [categoriesResult, productsResult] = await Promise.allSettled([
          prisma.category.findMany({
            orderBy: { name: "asc" },
          }),
          prisma.product.findMany({
            where: getPublicPublishedProductWhere(),
            include: {
              seller: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          }),
        ]);

        const categories = categoriesResult.status === "fulfilled" ? categoriesResult.value : [];
        const products = productsResult.status === "fulfilled" ? productsResult.value : [];

        if (categoriesResult.status === "rejected") {
          console.warn("[api/shop-page] category lookup failed; continuing with empty categories");
        }

        if (productsResult.status === "rejected") {
          console.warn("[api/shop-page] product lookup failed; continuing with empty products");
        }

        return {
          categories: categories.map(serializeCategory),
          products: products.map(serializeProduct),
        };
      },
      120,
    );

    setPublicCacheHeaders(res, {
      maxAgeSeconds: 120,
      sharedMaxAgeSeconds: 300,
      staleWhileRevalidateSeconds: 600,
    });
    res.json(payload);
  });

  app.get("/api/products/suggestions", async (req, res) => {
    const q = req.query.q as string;
    if (!q || q.length < 2) return res.json([]);

    const normalizedQuery = q.trim().toLowerCase();
    const suggestions = await getOrSetCache(
      `search:suggestions:${normalizedQuery}`,
      () =>
        prisma.product.findMany({
          where: {
            ...getPublicPublishedProductWhere(),
            OR: [
              { name: { contains: normalizedQuery, mode: "insensitive" } },
              { category: { contains: normalizedQuery, mode: "insensitive" } },
              { description: { contains: normalizedQuery, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            name: true,
            category: true,
            slug: true,
          },
          take: 8,
        }),
      120,
    );

    if (suggestions.length > 0) {
      return res.json(suggestions);
    }

    const fuzzySuggestions = await getOrSetCache(
      `search:suggestions:fuzzy:${normalizedQuery}`,
      async () => {
        const candidates = await prisma.product.findMany({
          select: {
            id: true,
            name: true,
            category: true,
            slug: true,
          },
          orderBy: [
            { reviewsCount: "desc" },
            { rating: "desc" },
            { createdAt: "desc" },
          ],
          take: 120,
        });

        return candidates
          .map((candidate) => ({
            ...candidate,
            _score: calculateFuzzySearchScore(normalizedQuery, `${candidate.name} ${candidate.category || ""}`),
          }))
          .filter((candidate) => candidate._score >= 72)
          .sort((a, b) => b._score - a._score || a.name.localeCompare(b.name))
          .slice(0, 8)
          .map(({ _score, ...candidate }) => candidate);
      },
      180,
    );

    res.json(fuzzySuggestions);
  });

  app.get("/api/search/products", async (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) {
      setPublicCacheHeaders(res, {
        maxAgeSeconds: 60,
        sharedMaxAgeSeconds: 120,
        staleWhileRevalidateSeconds: 300,
      });
      return res.json([]);
    }

    const payload = await getOrSetCache(
      `search:products:${q}`,
      async () => {
        const results = await prisma.product.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
          include: {
            seller: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { rating: "desc" },
            { reviewsCount: "desc" },
            { createdAt: "desc" },
          ],
          take: 60,
        });

        if (results.length > 0) {
          return results.map(serializeProduct);
        }

        const fuzzyCandidates = await prisma.product.findMany({
          include: {
            seller: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { reviewsCount: "desc" },
            { rating: "desc" },
            { createdAt: "desc" },
          ],
          take: 160,
        });

        return fuzzyCandidates
          .map((product) => ({
            product,
            score: calculateFuzzySearchScore(q, `${product.name} ${product.category || ""} ${product.description || ""}`),
          }))
          .filter((entry) => entry.score >= 70)
          .sort(
            (a, b) =>
              b.score - a.score ||
              Number(b.product.rating ?? 0) - Number(a.product.rating ?? 0) ||
              Number(b.product.reviewsCount ?? 0) - Number(a.product.reviewsCount ?? 0),
          )
          .slice(0, 60)
          .map((entry) => serializeProduct(entry.product));
      },
      90,
    );

    setPublicCacheHeaders(res, {
      maxAgeSeconds: 90,
      sharedMaxAgeSeconds: 180,
      staleWhileRevalidateSeconds: 300,
    });
    res.json(payload);
  });

  app.get("/api/search/discovery", async (_req, res) => {
    const payload = await getOrSetCache(
      "search:discovery",
      async () => {
        const [productsResult, categoriesResult] = await Promise.allSettled([
          prisma.product.findMany({
            select: {
              name: true,
              category: true,
            },
            orderBy: [
              { reviewsCount: "desc" },
              { rating: "desc" },
              { createdAt: "desc" },
            ],
            take: 20,
          }),
          prisma.category.findMany({
            select: {
              name: true,
            },
            take: 8,
          }),
        ]);

        const topProducts = productsResult.status === "fulfilled" ? productsResult.value : [];
        const topCategories = categoriesResult.status === "fulfilled" ? categoriesResult.value : [];

        if (productsResult.status === "rejected") {
          console.warn("[api/search/discovery] product lookup failed; continuing with empty products");
        }

        if (categoriesResult.status === "rejected") {
          console.warn("[api/search/discovery] category lookup failed; continuing with empty categories");
        }

        const trending = Array.from(
          new Set(
            [
              ...topCategories.map((category) => category.name),
              ...topProducts.flatMap((product) => [product.category, product.name]),
            ]
              .map((value) => String(value ?? "").trim())
              .filter((value) => value.length >= 3),
          ),
        ).slice(0, 10);

        return { trending };
      },
      300,
    );

    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      sharedMaxAgeSeconds: 600,
      staleWhileRevalidateSeconds: 1800,
    });
    res.json(payload);
  });

  app.post("/api/shipping/preview", async (req, res) => {
    const city = typeof req.body?.city === "string" ? req.body.city : "";
    const subtotal = Number(req.body?.subtotal ?? 0);
    const itemCount = Number(req.body?.itemCount ?? 1);
    const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const productIds = requestedItems
      .map((item: any) => String(item?.id ?? "").trim())
      .filter((value: string) => value.length > 0);
    const quantityByProductId = new Map<string, number>();

    requestedItems.forEach((item: any) => {
      const productId = String(item?.id ?? "").trim();
      if (!productId) return;
      const quantity = Math.max(1, Number(item?.quantity ?? 1) || 1);
      quantityByProductId.set(productId, quantity);
    });

    const tenantSetting = await prisma.tenantSetting.findFirst({
      orderBy: { createdAt: "asc" },
    });

    let warehouseRule: {
      insideDhakaFee?: number | null;
      outsideDhakaFee?: number | null;
      insideDhakaEta?: string | null;
      outsideDhakaEta?: string | null;
      warehouseName?: string | null;
      freeShippingThresholdOverride?: number | null;
    } | null = null;
    let multiWarehouse = false;
    let shipmentBreakdown: Array<{
      warehouse_id: string | null;
      warehouse_name: string;
      item_count: number;
      estimated_fee: number;
      estimated_fee_payable: number;
      estimated_eta: string;
      warehouse_rule_applied: boolean;
    }> = [];

    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          inventoryItems: {
            select: {
              warehouseId: true,
              quantity: true,
            },
            orderBy: { updatedAt: "desc" },
          },
        },
      });

      const warehouseIds = Array.from(
        new Set(
          products
            .map((product) => product.inventoryItems.find((inventoryItem) => Number(inventoryItem.quantity) > 0)?.warehouseId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      multiWarehouse = warehouseIds.length > 1;

      if (warehouseIds.length > 0) {
        const warehouses = await prisma.warehouse.findMany({
          where: { id: { in: warehouseIds } },
          select: {
            id: true,
            name: true,
            insideDhakaFee: true,
            outsideDhakaFee: true,
            insideDhakaEta: true,
            outsideDhakaEta: true,
            freeShippingThresholdOverride: true,
          },
        });

        const warehouseMap = new Map(
          warehouses.map((warehouse) => [
            warehouse.id,
            {
              id: warehouse.id,
              name: warehouse.name,
              insideDhakaFee: warehouse.insideDhakaFee == null ? null : toPlainNumber(warehouse.insideDhakaFee),
              outsideDhakaFee: warehouse.outsideDhakaFee == null ? null : toPlainNumber(warehouse.outsideDhakaFee),
              insideDhakaEta: warehouse.insideDhakaEta ?? null,
              outsideDhakaEta: warehouse.outsideDhakaEta ?? null,
              freeShippingThresholdOverride:
                warehouse.freeShippingThresholdOverride == null ? null : toPlainNumber(warehouse.freeShippingThresholdOverride),
            },
          ]),
        );

        const shipmentGroups = new Map<string, { warehouseId: string | null; warehouseName: string; itemCount: number }>();

        products.forEach((product) => {
          const selectedWarehouseId =
            product.inventoryItems.find((inventoryItem) => Number(inventoryItem.quantity) > 0)?.warehouseId ?? null;
          const requestedQuantity = quantityByProductId.get(product.id) ?? 1;
          const warehouseMeta = selectedWarehouseId ? warehouseMap.get(selectedWarehouseId) : null;
          const key = selectedWarehouseId ?? "unassigned";
          const current =
            shipmentGroups.get(key) ??
            {
              warehouseId: selectedWarehouseId,
              warehouseName: warehouseMeta?.name || "Primary fulfillment location",
              itemCount: 0,
            };

          current.itemCount += requestedQuantity;
          shipmentGroups.set(key, current);
        });

        shipmentBreakdown = Array.from(shipmentGroups.values()).map((group) => {
          const meta = group.warehouseId ? warehouseMap.get(group.warehouseId) : null;
          const groupPreview = calculateShippingPreview({
            city,
            subtotal,
            itemCount: group.itemCount,
            warehouseRule: meta
              ? {
                  warehouseName: meta.name,
                  insideDhakaFee: meta.insideDhakaFee,
                  outsideDhakaFee: meta.outsideDhakaFee,
                  insideDhakaEta: meta.insideDhakaEta,
                  outsideDhakaEta: meta.outsideDhakaEta,
                  freeShippingThresholdOverride: meta.freeShippingThresholdOverride,
                }
              : null,
          });

          return {
            warehouse_id: group.warehouseId,
            warehouse_name: group.warehouseName,
            item_count: group.itemCount,
            estimated_fee: groupPreview.estimated_fee,
            estimated_fee_payable: groupPreview.estimated_fee,
            estimated_eta: groupPreview.estimated_eta,
            warehouse_rule_applied: groupPreview.warehouse_rule_applied,
          };
        });
      }

      if (warehouseIds.length === 1) {
        const warehouse = shipmentBreakdown[0];
        const meta = warehouseIds[0]
          ? await prisma.warehouse.findUnique({
              where: { id: warehouseIds[0] },
              select: {
                name: true,
                insideDhakaFee: true,
                outsideDhakaFee: true,
                insideDhakaEta: true,
                outsideDhakaEta: true,
                freeShippingThresholdOverride: true,
              },
            })
          : null;

        if (meta) {
          warehouseRule = {
            warehouseName: meta.name,
            insideDhakaFee: meta.insideDhakaFee == null ? null : toPlainNumber(meta.insideDhakaFee),
            outsideDhakaFee: meta.outsideDhakaFee == null ? null : toPlainNumber(meta.outsideDhakaFee),
            insideDhakaEta: meta.insideDhakaEta ?? null,
            outsideDhakaEta: meta.outsideDhakaEta ?? null,
            freeShippingThresholdOverride:
              meta.freeShippingThresholdOverride == null ? null : toPlainNumber(meta.freeShippingThresholdOverride),
          };
        }
      }
    }

    const defaultFreeShippingThreshold = toPlainNumber(tenantSetting?.freeShippingThreshold ?? 2500);
    const freeShippingThreshold = warehouseRule?.freeShippingThresholdOverride ?? defaultFreeShippingThreshold;
    const preview = calculateShippingPreview({
      city,
      subtotal,
      itemCount,
      warehouseRule,
    });
    const qualifiesForFreeShipping = subtotal >= freeShippingThreshold;

    res.json({
      ...preview,
      free_shipping_threshold: freeShippingThreshold,
      qualifies_for_free_shipping: qualifiesForFreeShipping,
      estimated_fee_payable: qualifiesForFreeShipping ? 0 : preview.estimated_fee,
      shipment_breakdown: shipmentBreakdown.map((group) => ({
        ...group,
        estimated_fee_payable: qualifiesForFreeShipping ? 0 : group.estimated_fee_payable,
      })),
      checkout_note: qualifiesForFreeShipping
        ? "You have unlocked free delivery for this order."
        : multiWarehouse
          ? "This cart may ship from multiple pickup locations. Delivery estimate shown here is a blended preview and final courier assignment may split the shipment."
          : warehouseRule?.warehouseName
            ? `Estimated from ${warehouseRule.warehouseName}. Final courier assignment may refine this after address validation.`
            : "Delivery fee is estimated from the city and cart size. Final courier assignment may refine this after address validation.",
    });
  });

  app.get("/api/ai/recommendations", async (req, res) => {
    const productId = req.query.productId ? String(req.query.productId) : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 4, 12);
    const cacheKey = `ai:recommendations:${productId ?? "global"}:${limit}`;

    const payload = await getOrSetCache(
      cacheKey,
      async () => {
        let recommendations: any[] = [];

        if (productId) {
          const currentProduct = await prisma.product.findUnique({
            where: { id: productId },
            select: { category: true },
          });

          if (currentProduct?.category) {
            recommendations = await prisma.product.findMany({
              where: {
                category: currentProduct.category,
                id: { not: productId },
              },
              orderBy: [{ rating: "desc" }, { reviewsCount: "desc" }],
              take: limit,
              include: { seller: { select: { name: true } } },
            });
          }
        }

        if (recommendations.length === 0) {
          recommendations = await prisma.product.findMany({
            orderBy: [{ rating: "desc" }, { reviewsCount: "desc" }, { createdAt: "desc" }],
            take: limit,
            include: { seller: { select: { name: true } } },
          });
        }

        return recommendations.map(serializeProduct);
      },
      120,
    );

    res.json(payload);
  });

  app.get("/api/user/points", authenticateToken, async (req: any, res) => {
    const user = await prisma.user.findUnique({
      where: { id: String(req.user.id) },
      select: {
        points: true,
        walletBalance: true,
      },
    });
    res.json(user ? { points: user.points, wallet_balance: toPlainNumber(user.walletBalance) } : { points: 0, wallet_balance: 0 });
  });

  app.get("/api/public/commerce-config", async (_req, res) => {
    try {
      const config = await getOrSetCache(
        "public:commerce-config",
        async () => {
          const [defaultTenantSetting, rawSettings, commerceChannels] = await Promise.all([
            prisma.tenantSetting.findFirst({
              orderBy: { createdAt: "asc" },
            }),
            prismaDirect.platformSetting.findMany({
              where: {
                key: {
                  in: [
                    "exit_intent_enabled",
                    "exit_intent_title",
                    "exit_intent_message",
                    "exit_intent_code",
                    "exit_intent_primary_cta",
                    "exit_intent_secondary_cta",
                  ],
                },
              },
            }),
            getCommerceChannelSettings(),
          ]);

          const settingMap = rawSettings.reduce<Record<string, string>>((acc, row) => {
            acc[row.key] = row.value;
            return acc;
          }, {});

          return {
            free_shipping_threshold: toPlainNumber(defaultTenantSetting?.freeShippingThreshold ?? 2500),
            low_stock_threshold: env.LOW_STOCK_THRESHOLD,
            cart_recovery_delay_mins: defaultTenantSetting?.cartRecoveryDelayMins ?? 120,
            ...serializeCommerceChannelSettings(commerceChannels),
            exit_intent: {
              enabled: settingMap.exit_intent_enabled !== "false",
              title: settingMap.exit_intent_title || "Keep your shortlist moving with a softer first order",
              message: settingMap.exit_intent_message || "Use code WELCOME10 for an extra conversion push on your next checkout.",
              code: settingMap.exit_intent_code || "WELCOME10",
              primary_cta: settingMap.exit_intent_primary_cta || "Review cart",
              secondary_cta: settingMap.exit_intent_secondary_cta || "Keep browsing",
            },
          };
        },
        300,
      );

      res.json(config);
    } catch (error) {
      logServerError("load public commerce config", error);
      const fallbackConfig = {
        free_shipping_threshold: 2500,
        low_stock_threshold: env.LOW_STOCK_THRESHOLD,
        cart_recovery_delay_mins: 120,
        enabled_checkout_payment_methods: ['cod'],
        enabled_manual_order_payment_methods: ['cod'],
        enabled_courier_providers: ['pathao'],
        exit_intent: {
          enabled: true,
          title: "Keep your shortlist moving with a softer first order",
          message: "Use code WELCOME10 for an extra conversion push on your next checkout.",
          code: "WELCOME10",
          primary_cta: "Review cart",
          secondary_cta: "Keep browsing",
        },
      };

      if (isDatabaseUnavailableError(error)) {
        res.setHeader("X-Data-Source", "fallback");
        return res.status(200).json(fallbackConfig);
      }

      return res.status(500).json({ error: "Failed to load commerce config" });
    }
  });

  app.get("/api/public/about-page", async (_req, res) => {
    const rows = await prismaDirect.platformSetting.findMany({
      where: {
        key: {
          in: [
            "about_hero_title",
            "about_hero_highlight",
            "about_hero_description",
            "about_hero_image",
            "about_mission_title",
            "about_mission_body",
            "about_why_title",
            "about_why_body",
            "about_story_image",
            "about_hero_title_bn",
            "about_hero_highlight_bn",
            "about_hero_description_bn",
            "about_mission_title_bn",
            "about_mission_body_bn",
            "about_why_title_bn",
            "about_why_body_bn",
            "about_stats_json",
            "about_trust_cards_json",
            "about_team_json",
            "about_cta_en_json",
            "about_cta_bn_json",
          ],
        },
      },
    });

    const settings = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    const parseJson = <T,>(value: string | undefined, fallback: T) => {
      if (!value) return fallback;
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    };

    res.json({
      hero_title: settings.about_hero_title || "Empowering Bangladesh's",
      hero_highlight: settings.about_hero_highlight || "Digital Marketplace",
      hero_description:
        settings.about_hero_description ||
        "LofiMart is more than just an e-commerce platform. We are a bridge between local artisans, passionate sellers, and millions of customers.",
      hero_image:
        settings.about_hero_image ||
        "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1400&q=80",
      mission_title: settings.about_mission_title || "Our Mission",
      mission_body:
        settings.about_mission_body ||
        "Founded in 2024, LofiMart was born out of a simple idea: to make quality products accessible to everyone in Bangladesh, regardless of their location. We believe in the power of technology to transform lives and businesses. Our mission is to provide a seamless, secure, and enjoyable shopping experience while fostering the growth of local entrepreneurs.",
      why_title: settings.about_why_title || "Why Choose Us?",
      why_body:
        settings.about_why_body ||
        "We prioritize quality over quantity. Every seller on our platform goes through a rigorous verification process to ensure that you receive only the best products. From traditional Jamdani sarees to the latest tech gadgets, we curate our collection to meet the diverse needs of our community.",
      story_image:
        settings.about_story_image ||
        "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
      hero_title_bn: settings.about_hero_title_bn || "বাংলাদেশের",
      hero_highlight_bn: settings.about_hero_highlight_bn || "ডিজিটাল মার্কেটপ্লেসকে এগিয়ে নিচ্ছি",
      hero_description_bn:
        settings.about_hero_description_bn ||
        "LofiMart শুধু একটি ই-কমার্স প্ল্যাটফর্ম নয়। আমরা স্থানীয় উদ্যোক্তা, বিশ্বস্ত বিক্রেতা এবং লক্ষ গ্রাহকের মাঝে একটি শক্তিশালী সংযোগ গড়ে তুলি।",
      mission_title_bn: settings.about_mission_title_bn || "আমাদের লক্ষ্য",
      mission_body_bn:
        settings.about_mission_body_bn ||
        "বাংলাদেশের প্রতিটি মানুষের কাছে মানসম্মত পণ্য পৌঁছে দিতে এবং স্থানীয় উদ্যোক্তাদের জন্য টেকসই ডিজিটাল বিক্রয় পরিবেশ তৈরি করাই LofiMart-এর মূল লক্ষ্য।",
      why_title_bn: settings.about_why_title_bn || "কেন LofiMart?",
      why_body_bn:
        settings.about_why_body_bn ||
        "আমরা যাচাইকৃত বিক্রেতা, নিরাপদ পেমেন্ট, নির্ভরযোগ্য ডেলিভারি এবং উন্নত কাস্টমার সাপোর্টের মাধ্যমে একটি আস্থাভিত্তিক কেনাকাটার অভিজ্ঞতা তৈরি করি।",
      trust_cards: parseJson(settings.about_trust_cards_json, [
        { icon: "shield", title_en: "Trusted", title_bn: "বিশ্বস্ত", description_en: "Verified sellers and secure payments", description_bn: "যাচাইকৃত সেলার এবং নিরাপদ পেমেন্ট" },
        { icon: "truck", title_en: "Fast Delivery", title_bn: "দ্রুত ডেলিভারি", description_en: "Nationwide shipping in 3-5 days", description_bn: "সারাদেশে ৩-৫ দিনের ডেলিভারি" },
        { icon: "clock", title_en: "24/7 Support", title_bn: "২৪/৭ সাপোর্ট", description_en: "Always here to help you", description_bn: "সবসময় সাহায্যের জন্য প্রস্তুত" },
        { icon: "heart", title_en: "Local First", title_bn: "লোকাল ফার্স্ট", description_en: "Supporting Bangladeshi brands", description_bn: "বাংলাদেশি ব্র্যান্ডকে এগিয়ে নেওয়া" },
      ]),
      stats: parseJson(settings.about_stats_json, [
        { value: "10K+", label_en: "Customers served", label_bn: "সন্তুষ্ট গ্রাহক", description_en: "Growing orders across Bangladesh", description_bn: "সারা দেশে বাড়ছে অর্ডার" },
        { value: "500+", label_en: "Verified sellers", label_bn: "যাচাইকৃত সেলার", description_en: "Curated and reviewed merchants", description_bn: "যাচাই করা বিক্রেতা নেটওয়ার্ক" },
        { value: "64", label_en: "District reach", label_bn: "জেলা কভারেজ", description_en: "Delivery support across the country", description_bn: "দেশব্যাপী ডেলিভারি নেটওয়ার্ক" },
        { value: "24/7", label_en: "Support coverage", label_bn: "সাপোর্ট সুবিধা", description_en: "Always-on customer assistance", description_bn: "সবসময় প্রস্তুত সহায়তা" },
      ]),
      team: parseJson(settings.about_team_json, [
        { name: "Ayesha Rahman", role_en: "Marketplace Operations Lead", role_bn: "মার্কেটপ্লেস অপারেশনস লিড", bio_en: "Builds reliable seller and customer experiences end to end.", bio_bn: "সেলার ও কাস্টমার অভিজ্ঞতাকে নির্ভরযোগ্য করে তোলেন।", image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80" },
        { name: "Imran Hossain", role_en: "Trust & Growth Manager", role_bn: "ট্রাস্ট ও গ্রোথ ম্যানেজার", bio_en: "Leads verification, conversion, and platform confidence systems.", bio_bn: "ভেরিফিকেশন, কনভার্সন ও প্ল্যাটফর্ম ট্রাস্ট দেখভাল করেন।", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80" },
        { name: "Nusrat Jahan", role_en: "Customer Experience Lead", role_bn: "কাস্টমার এক্সপেরিয়েন্স লিড", bio_en: "Focuses on support quality, returns confidence, and retention.", bio_bn: "সাপোর্ট, রিটার্ন অভিজ্ঞতা ও গ্রাহক ধরে রাখার কাজে নেতৃত্ব দেন।", image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=800&q=80" },
      ]),
      cta_en: parseJson(settings.about_cta_en_json, {
        title: "Build with us, shop with confidence",
        body: "Whether you are discovering new products or growing as a seller, LofiMart gives you a more trusted commerce experience.",
        primary_label: "Start Shopping",
        primary_link: "/shop",
        secondary_label: "Become a Seller",
        secondary_link: "/seller/dashboard",
      }),
      cta_bn: parseJson(settings.about_cta_bn_json, {
        title: "আস্থার সাথে কেনাকাটা করুন, আমাদের সাথে বড় হোন",
        body: "নতুন পণ্য খুঁজে পাওয়া হোক বা একজন বিক্রেতা হিসেবে বৃদ্ধি, LofiMart আপনাকে আরও নির্ভরযোগ্য কমার্স অভিজ্ঞতা দেয়।",
        primary_label: "শপিং শুরু করুন",
        primary_link: "/shop",
        secondary_label: "সেলার হোন",
        secondary_link: "/seller/dashboard",
      }),
    });
  });

  app.get("/api/user/wallet", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const [user, transactions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          points: true,
          walletBalance: true,
          tenantId: true,
        },
      }),
      prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    res.json({
      points: user?.points ?? 0,
      wallet_balance: toPlainNumber(user?.walletBalance ?? 0),
      transactions: transactions.map(serializeWalletTransaction),
    });
  });

  app.get("/api/user/rewards/history", authenticateToken, async (req: any, res) => {
    const logs = await prisma.rewardLog.findMany({
      where: { userId: String(req.user.id) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(logs.map(serializeRewardLog));
  });

  app.get("/api/user/engagement/overview", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    await ensureEngagementBootstrap(userId, tenantId);
    const [user, streak, referralCode, missions, notifications, tenantSetting, spinRewards, lastSpin] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { points: true, walletBalance: true, tenantId: true },
      }),
      prisma.loginStreak.findUnique({ where: { userId } }),
      prisma.referralCode.findFirst({ where: { userId, tenantId: tenantId ?? null } }),
      prisma.missionProgress.findMany({
        where: { userId },
        include: { mission: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      ensureTenantSetting(tenantId),
      prisma.spinReward.findMany({
        where: { tenantId: tenantId ?? null, isActive: true },
        orderBy: { displayOrder: "asc" },
      }),
      prisma.spinHistory.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      points: user?.points ?? 0,
      wallet_balance: toPlainNumber(user?.walletBalance ?? 0),
      streak: serializeLoginStreak(streak),
      referral: referralCode ? serializeReferralCode(referralCode) : null,
      missions: missions.map(serializeMissionProgress),
      notifications: notifications.map(serializeUserNotification),
      settings: serializeTenantSetting(tenantSetting),
      spin_rewards: spinRewards.map(serializeSpinReward),
      last_spin: lastSpin ? serializeSpinHistory(lastSpin) : null,
    });
  });

  app.get("/api/user/login-streak", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    const streak = await prisma.loginStreak.findUnique({ where: { userId } });
    const settings = await ensureTenantSetting(tenantId);

    res.json({
      ...serializeLoginStreak(streak),
      next_reward_coins: Math.min(
        (settings?.dailyLoginBaseCoins ?? 10) * Math.max((streak?.currentStreak ?? 0) + 1, 1),
        settings?.dailyLoginMaxCoins ?? 70,
      ),
    });
  });

  app.post("/api/user/login-streak/claim", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    const result = await claimDailyLoginReward(userId, tenantId);

    res.json({
      success: true,
      already_claimed: Boolean(result.alreadyClaimed),
      reward_coins: result.alreadyClaimed ? 0 : result.rewardCoins ?? 0,
      streak: serializeLoginStreak(result.streak),
    });
  });

  app.get("/api/user/spin-wheel", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    await ensureDefaultSpinRewards(tenantId);
    const [rewards, history] = await Promise.all([
      prisma.spinReward.findMany({
        where: { tenantId: tenantId ?? null, isActive: true },
        orderBy: { displayOrder: "asc" },
      }),
      prisma.spinHistory.findFirst({
        where: {
          userId,
          dateKey: new Date().toISOString().slice(0, 10),
        },
      }),
    ]);

    res.json({
      rewards: rewards.map(serializeSpinReward),
      today_spin: history ? serializeSpinHistory(history) : null,
    });
  });

  app.post("/api/user/spin-wheel/spin", authenticateToken, rateLimit("spin-wheel", 10, 60_000), async (req: any, res) => {
    try {
      const userId = String(req.user.id);
      const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
      const result = await runDailySpin(userId, tenantId);

      if (!result.alreadySpun) {
        await createNotification({
          userId,
          tenantId,
          type: "reward",
          title: "Daily bonus added",
          message: `Today's member reward has been added: ${result.reward?.label ?? result.history?.rewardLabel}.`,
          actionUrl: "/account/rewards",
        });
      }

      res.json({
        success: true,
        already_spun: Boolean(result.alreadySpun),
        reward: result.reward ? serializeSpinReward(result.reward) : null,
        history: result.history ? serializeSpinHistory(result.history) : null,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Unable to spin right now" });
    }
  });

  app.get("/api/user/referral", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    const code = await ensureReferralCodeForUser(userId, tenantId);
    const attributions = await prisma.referralAttribution.findMany({
      where: { inviterId: userId },
      include: {
        invitee: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({
      code: serializeReferralCode(code),
      attributions: attributions.map(serializeReferralAttribution),
      referral_url: `${env.FRONTEND_URL}/register?ref=${code.code}`,
    });
  });

  app.post("/api/user/referral/redeem", authenticateToken, async (req: any, res) => {
    const parsed = referralRedeemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid referral code" });
    }

    const userId = String(req.user.id);
    const existing = await prisma.referralAttribution.findFirst({
      where: { inviteeId: userId },
    });
    if (existing) {
      return res.status(400).json({ error: "A referral code has already been applied to this account" });
    }

    const code = await prisma.referralCode.findUnique({
      where: { code: parsed.data.code.toUpperCase() },
    });

    if (!code || code.userId === userId) {
      return res.status(404).json({ error: "Referral code is not valid" });
    }

    const settings = await ensureTenantSetting(code.tenantId ?? null);
    const attribution = await prisma.referralAttribution.create({
      data: {
        codeId: code.id,
        inviterId: code.userId,
        inviteeId: userId,
        inviteeEmail: req.user.email ?? null,
        status: "rewarded",
        rewardGrantedAt: new Date(),
      },
    });

    await prisma.referralCode.update({
      where: { id: code.id },
      data: {
        successfulReferrals: { increment: 1 },
        earnings: { increment: settings?.referralInviterCoins ?? 150 },
      },
    });

    await Promise.all([
      grantReward({
        userId: code.userId,
        tenantId: code.tenantId,
        eventType: "referral_inviter",
        source: "referral",
        description: "Referral reward for inviting a new verified account",
        coins: settings?.referralInviterCoins ?? 150,
        referenceId: attribution.id,
      }),
      grantReward({
        userId,
        tenantId: code.tenantId,
        eventType: "referral_invitee",
        source: "referral",
        description: "Referral reward for joining through an invite code",
        coins: settings?.referralInviteeCoins ?? 100,
        referenceId: attribution.id,
      }),
      createNotification({
        userId: code.userId,
        tenantId: code.tenantId,
        type: "reward",
        title: "Referral bonus added",
        message: "Your referral successfully joined and the loyalty bonus has been added to your account.",
        actionUrl: "/account/rewards",
      }),
      createNotification({
        userId,
        tenantId: code.tenantId,
        type: "reward",
        title: "Referral applied",
        message: "Your invite bonus has been added to your rewards balance.",
        actionUrl: "/account/rewards",
      }),
    ]);

    res.json({ success: true, attribution: serializeReferralAttribution(attribution) });
  });

  app.get("/api/user/missions", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    await ensureDefaultMissions(tenantId);

    const missions = await prisma.mission.findMany({
      where: { OR: [{ tenantId: tenantId ?? null }, { tenantId: null }], isActive: true },
      orderBy: { createdAt: "asc" },
    });

    const progressRows = await Promise.all(
      missions.map((mission) =>
        prisma.missionProgress.upsert({
          where: {
            userId_missionId: {
              userId,
              missionId: mission.id,
            },
          },
          update: {},
          create: {
            userId,
            missionId: mission.id,
          },
          include: { mission: true },
        }),
      ),
    );

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.name && user.emailVerified) {
      await updateMissionProgress(userId, "complete-profile", 1);
    }

    res.json(progressRows.map(serializeMissionProgress));
  });

  app.post("/api/user/missions/:id/claim", authenticateToken, async (req: any, res) => {
    const progress = await prisma.missionProgress.findFirst({
      where: {
        userId: String(req.user.id),
        missionId: req.params.id,
      },
      include: { mission: true },
    });

    if (!progress || !progress.mission) {
      return res.status(404).json({ error: "Mission not found" });
    }

    if (progress.claimedAt) {
      return res.status(400).json({ error: "Mission reward already claimed" });
    }

    if (progress.progress < progress.mission.targetCount) {
      return res.status(400).json({ error: "Mission requirements are not complete yet" });
    }

    const updated = await prisma.missionProgress.update({
      where: { id: progress.id },
      data: { claimedAt: new Date(), completedAt: progress.completedAt ?? new Date() },
      include: { mission: true },
    });

    await grantReward({
      userId: String(req.user.id),
      tenantId: req.user.tenantId ?? null,
      eventType: "mission_claim",
      source: "mission",
      description: `Mission completed: ${progress.mission.title}`,
      coins: progress.mission.rewardCoins,
      walletAmount: Number(progress.mission.rewardWallet ?? 0),
      referenceId: progress.id,
    });

    res.json({ success: true, mission: serializeMissionProgress(updated) });
  });

  app.get("/api/notifications", authenticateToken, async (req: any, res) => {
    const notifications = await prisma.userNotification.findMany({
      where: { userId: String(req.user.id) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(notifications.map(serializeUserNotification));
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req: any, res) => {
    const updated = await prisma.userNotification.updateMany({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      data: {
        readAt: new Date(),
      },
    });

    res.json({ success: true, updated: updated.count });
  });

  app.post("/api/notifications/read-all", authenticateToken, async (req: any, res) => {
    const updated = await prisma.userNotification.updateMany({
      where: {
        userId: String(req.user.id),
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    res.json({ success: true, updated: updated.count });
  });

  app.get("/api/home", async (_req, res) => {
    const payload = await getOrSetCache(
      "home:payload",
      async () => {
        const [products, banners, categories, topSellers, bestsellerRows] = await Promise.all([
          prisma.product.findMany({
            where: getPublicPublishedProductWhere(),
            orderBy: { createdAt: "desc" },
            take: 20,
            include: {
              seller: {
                select: { name: true },
              },
            },
          }),
          prismaDirect.banner.findMany({
            where: { isActive: true },
            orderBy: { createdAt: "desc" },
          }),
          prisma.category.findMany({
            include: {
              subcategories: {
                include: {
                  subsubcategories: true,
                },
                orderBy: { name: "asc" },
              },
            },
            orderBy: { name: "asc" },
          }),
          prisma.user.findMany({
            where: {
              role: "seller",
              isBlocked: false,
              sellerStatus: SELLER_STATUSES.approved,
              storefrontPublished: true,
              profileVisibility: { not: "private" },
            },
            take: 6,
            orderBy: [
              { products: { _count: "desc" } },
              { updatedAt: "desc" },
            ],
            select: {
              id: true,
              name: true,
              storeName: true,
              storefrontSlug: true,
              storefrontBannerUrl: true,
              storefrontHeadline: true,
              avatarUrl: true,
              bio: true,
              responseTimeHours: true,
              verificationSubmission: {
                select: {
                  status: true,
                },
              },
              products: {
                select: {
                  rating: true,
                  reviewsCount: true,
                },
                take: 24,
              },
            },
          }),
          prisma.orderItem.groupBy({
            by: ["productId"],
            where: {
              order: {
                status: {
                  notIn: ["cancelled", "failed"],
                },
              },
            },
            _sum: {
              qty: true,
            },
            orderBy: {
              _sum: {
                qty: "desc",
              },
            },
            take: 8,
          }),
        ]);

        const bestsellerIds = bestsellerRows.map((row) => row.productId);
        const bestsellerProducts =
          bestsellerIds.length > 0
            ? await prisma.product.findMany({
                where: {
                  id: {
                    in: bestsellerIds,
                  },
                },
                include: {
                  seller: {
                    select: {
                      name: true,
                    },
                  },
                },
              })
            : [];
        const bestsellerMap = new Map(bestsellerProducts.map((product) => [product.id, product]));

        return {
          products: products.map(serializeProduct),
          bestsellers: bestsellerRows
            .map((row) => {
              const product = bestsellerMap.get(row.productId);
              if (!product) return null;

              return {
                ...serializeProduct(product),
                sold_count: Number(row._sum.qty ?? 0),
              };
            })
            .filter(Boolean),
          top_sellers: topSellers.map(serializeHomeSeller),
          banners: banners.map(serializeBanner),
          categories: categories.map((category) => ({
            ...serializeCategory(category),
            subcategories: category.subcategories.map((subcategory: any) => ({
              ...serializeSubcategory(subcategory),
              subsubcategories: subcategory.subsubcategories.map(serializeSubsubcategory),
            })),
          })),
        };
      },
      300,
    );

    setPublicCacheHeaders(res, {
      maxAgeSeconds: 300,
      sharedMaxAgeSeconds: 600,
      staleWhileRevalidateSeconds: 1800,
    });
    res.json(payload);
  });

  app.get("/api/community/feed", async (req: any, res) => {
    try {
      let currentUserId: string | null = null;
      const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
      if (authHeader.startsWith("Bearer ")) {
        try {
          const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET) as any;
          currentUserId = decoded?.id ? String(decoded.id) : null;
        } catch {
          currentUserId = null;
        }
      }

      res.setHeader("Vary", "Authorization");
      if (currentUserId) {
        setPrivateNoStoreHeaders(res);
      } else {
        setPublicCacheHeaders(res, {
          maxAgeSeconds: 60,
          sharedMaxAgeSeconds: 120,
          staleWhileRevalidateSeconds: 300,
        });
      }

      const basePayload = await getOrSetCache(
        "community:feed:anon",
        async () => {
          const [posts, reviews, contributors, products] = await Promise.all([
            prisma.communityPost.findMany({
              where: { status: "approved" },
              select: {
                id: true,
                title: true,
                content: true,
                imageUrl: true,
                topic: true,
                createdAt: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                  },
                },
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    image: true,
                    category: true,
                    price: true,
                    reviewsCount: true,
                  },
                },
                _count: {
                  select: {
                    likes: true,
                    comments: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
              take: 12,
            }),
            prisma.review.findMany({
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                  },
                },
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    image: true,
                    category: true,
                    price: true,
                    reviewsCount: true,
                  },
                },
              },
              orderBy: { createdAt: "desc" },
              take: 8,
            }),
            prisma.user.findMany({
              where: {
                role: { in: ["seller", "reseller"] },
                isBlocked: false,
              },
              select: {
                id: true,
                name: true,
                role: true,
                _count: {
                  select: {
                    products: true,
                  },
                },
                products: {
                  select: {
                    reviewsCount: true,
                  },
                  take: 12,
                },
              },
              take: 3,
              orderBy: [{ products: { _count: "desc" } }, { createdAt: "desc" }],
            }),
            prisma.product.findMany({
              select: {
                category: true,
                reviewsCount: true,
              },
              take: 120,
              orderBy: [{ reviewsCount: "desc" }, { createdAt: "desc" }],
            }),
          ]);

          const topicMap = new Map<string, number>();
          for (const product of products) {
            const key = buildCommunityTopic(product.category);
            const current = topicMap.get(key) ?? 0;
            topicMap.set(key, current + Math.max(Number(product.reviewsCount ?? 0), 1));
          }

          const trendingTopics = Array.from(topicMap.entries())
            .map(([tag, postsCount]) => ({ tag, posts: postsCount }))
            .sort((a, b) => b.posts - a.posts)
            .slice(0, 4)
            .map(serializeCommunityTopic);

          const sellersCount = contributors.filter((user) => user.role === "seller").length;
          const resellersCount = contributors.filter((user) => user.role === "reseller").length;

          return {
            posts,
            reviews,
            top_contributors: contributors.map(serializeCommunityContributor),
            trending_topics: trendingTopics,
            stats: {
              average_rating: reviews.length
                ? Number((reviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / reviews.length).toFixed(1))
                : 4.8,
              fresh_updates_label: "Daily",
              verified_partners: sellersCount + resellersCount,
            },
          };
        },
        60,
      );

      const likedPostIds = currentUserId
        ? await prisma.communityPostLike.findMany({
            where: {
              userId: currentUserId,
              postId: {
                in: basePayload.posts.map((post: any) => post.id),
              },
            },
            select: { postId: true },
          })
        : [];
      const likedIdSet = new Set(likedPostIds.map((row) => row.postId));

      const items =
        basePayload.posts.length > 0
          ? basePayload.posts.map((post: any) => ({
              ...serializeCommunityPost(
                {
                  ...post,
                  likes: Array.from({ length: Number(post._count?.likes ?? 0) }, () => ({ userId: "__count__" })),
                  comments: Array.from({ length: Number(post._count?.comments ?? 0) }, (_, index) => ({ id: `count-${index}` })),
                },
                currentUserId,
              ),
              liked_by_me: likedIdSet.has(post.id),
            }))
          : basePayload.reviews.map(serializeCommunityFeedItem);
      const weeklyInteractions = items.reduce((sum, item) => sum + item.likes + item.comments + item.saves, 0);

      res.json({
        items,
        trending_topics: basePayload.trending_topics,
        top_contributors: basePayload.top_contributors,
        stats: {
          weekly_interactions: weeklyInteractions,
          average_rating: basePayload.stats.average_rating,
          fresh_updates_label: basePayload.stats.fresh_updates_label,
          verified_partners: basePayload.stats.verified_partners,
        },
      });
    } catch {
      res.status(500).json({ error: "Unable to load community feed right now" });
    }
  });

  app.post("/api/community/posts", authenticateToken, async (req: any, res) => {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const imageUrl = typeof req.body?.image_url === "string" ? req.body.image_url.trim() : "";
    const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    const productSlug = typeof req.body?.product_slug === "string" ? req.body.product_slug.trim() : "";

    if (content.length < 12) {
      return res.status(400).json({ error: "Post content must be at least 12 characters long" });
    }

    if (content.length > 1500) {
      return res.status(400).json({ error: "Post content is too long" });
    }

    const userId = String(req.user.id);
    const tenantId = await getEffectiveTenantId(userId, req.user.tenantId);
    const product = productSlug
      ? await prisma.product.findUnique({
          where: { slug: productSlug },
          select: { id: true, name: true, slug: true, image: true, category: true, price: true, reviewsCount: true },
        })
      : null;

    const created = await prisma.communityPost.create({
      data: {
        userId,
        tenantId,
        productId: product?.id ?? null,
        title: title || null,
        content,
        imageUrl: imageUrl || null,
        topic: topic || buildCommunityTopic(product?.category),
        status: "approved",
      },
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
        product: {
          select: { id: true, name: true, slug: true, image: true, category: true, price: true, reviewsCount: true },
        },
        likes: {
          select: { userId: true },
        },
        comments: {
          where: { status: "visible" },
          select: { id: true },
        },
      },
    });

    await handleAuditLog(userId, "community.post.created", "community_post", created.id, {
      productId: product?.id ?? null,
      topic: created.topic,
    });

    res.status(201).json({ success: true, post: serializeCommunityPost(created, userId) });
  });

  app.patch("/api/community/posts/:id", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const existing = await prisma.communityPost.findUnique({
      where: { id: req.params.id },
      include: {
        product: {
          select: { id: true, category: true },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Community post not found" });
    }

    if (existing.userId !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have permission to update this post" });
    }

    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const imageUrl = typeof req.body?.image_url === "string" ? req.body.image_url.trim() : "";
    const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    const productSlug = typeof req.body?.product_slug === "string" ? req.body.product_slug.trim() : "";

    if (content.length < 12) {
      return res.status(400).json({ error: "Post content must be at least 12 characters long" });
    }

    if (content.length > 1500) {
      return res.status(400).json({ error: "Post content is too long" });
    }

    const product = productSlug
      ? await prisma.product.findUnique({
          where: { slug: productSlug },
          select: { id: true, name: true, slug: true, image: true, category: true, price: true, reviewsCount: true },
        })
      : null;

    const updated = await prisma.communityPost.update({
      where: { id: existing.id },
      data: {
        title: title || null,
        content,
        imageUrl: imageUrl || null,
        topic: topic || buildCommunityTopic(product?.category ?? existing.product?.category),
        productId: product?.id ?? null,
      },
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
        product: {
          select: { id: true, name: true, slug: true, image: true, category: true, price: true, reviewsCount: true },
        },
        likes: {
          select: { userId: true },
        },
        comments: {
          where: { status: "visible" },
          select: { id: true },
        },
      },
    });

    await handleAuditLog(userId, "community.post.updated", "community_post", updated.id, {
      productId: product?.id ?? null,
      topic: updated.topic,
    });

    res.json({ success: true, post: serializeCommunityPost(updated, userId) });
  });

  app.delete("/api/community/posts/:id", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const existing = await prisma.communityPost.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Community post not found" });
    }

    if (existing.userId !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have permission to delete this post" });
    }

    await prisma.communityPost.delete({
      where: { id: existing.id },
    });

    await handleAuditLog(userId, "community.post.deleted", "community_post", existing.id);

    res.json({ success: true });
  });

  app.get("/api/community/posts/:id/comments", async (req, res) => {
    const post = await prisma.communityPost.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });

    if (!post || post.status !== "approved") {
      return res.status(404).json({ error: "Community post not found" });
    }

    const comments = await prisma.communityPostComment.findMany({
      where: {
        postId: req.params.id,
        status: "visible",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    res.json(comments.map(serializeCommunityComment));
  });

  app.post("/api/community/posts/:id/comments", authenticateToken, async (req: any, res) => {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length < 2) {
      return res.status(400).json({ error: "Comment is too short" });
    }

    if (content.length > 600) {
      return res.status(400).json({ error: "Comment is too long" });
    }

    const post = await prisma.communityPost.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, userId: true, tenantId: true },
    });

    if (!post || post.status !== "approved") {
      return res.status(404).json({ error: "Community post not found" });
    }

    const userId = String(req.user.id);
    const created = await prisma.$transaction(async (tx) => {
      const comment = await tx.communityPostComment.create({
        data: {
          postId: post.id,
          userId,
          content,
          status: "visible",
        },
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      await tx.communityPost.update({
        where: { id: post.id },
        data: {
          commentsCount: { increment: 1 },
        },
      });

      return comment;
    });

    await handleAuditLog(userId, "community.comment.created", "community_post_comment", created.id, {
      postId: post.id,
    });

    if (post.userId !== userId) {
      await createNotification({
        userId: post.userId,
        tenantId: post.tenantId ?? null,
        createdById: userId,
        type: "community",
        title: "New comment on your community post",
        message: `${created.user?.name ?? "A community member"} commented on your post.`,
        actionUrl: `/community?post=${post.id}`,
        metadata: { postId: post.id, commentId: created.id },
      });
    }

    res.status(201).json({ success: true, comment: serializeCommunityComment(created) });
  });

  app.patch("/api/community/comments/:id", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (content.length < 2) {
      return res.status(400).json({ error: "Comment is too short" });
    }
    if (content.length > 600) {
      return res.status(400).json({ error: "Comment is too long" });
    }

    const existing = await prisma.communityPostComment.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Comment not found" });
    }
    if (existing.userId !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have permission to edit this comment" });
    }

    const updated = await prisma.communityPostComment.update({
      where: { id: existing.id },
      data: { content },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    await handleAuditLog(userId, "community.comment.updated", "community_post_comment", updated.id, {
      postId: updated.postId,
    });

    res.json({ success: true, comment: serializeCommunityComment(updated) });
  });

  app.delete("/api/community/comments/:id", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const existing = await prisma.communityPostComment.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, postId: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Comment not found" });
    }
    if (existing.userId !== userId && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have permission to delete this comment" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.communityPostComment.delete({
        where: { id: existing.id },
      });
      if (existing.status === "visible") {
        await tx.communityPost.update({
          where: { id: existing.postId },
          data: {
            commentsCount: { decrement: 1 },
          },
        });
      }
    });

    await handleAuditLog(userId, "community.comment.deleted", "community_post_comment", existing.id, {
      postId: existing.postId,
    });

    res.json({ success: true });
  });

  app.post("/api/community/posts/:id/like", authenticateToken, async (req: any, res) => {
    const post = await prisma.communityPost.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, userId: true, tenantId: true },
    });

    if (!post || post.status !== "approved") {
      return res.status(404).json({ error: "Community post not found" });
    }

    const userId = String(req.user.id);
    const existing = await prisma.communityPostLike.findUnique({
      where: {
        postId_userId: {
          postId: post.id,
          userId,
        },
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.communityPostLike.delete({
          where: {
            postId_userId: {
              postId: post.id,
              userId,
            },
          },
        });

        const updated = await tx.communityPost.update({
          where: { id: post.id },
          data: {
            likesCount: { decrement: 1 },
          },
          select: { likesCount: true },
        });

        return { liked: false, likesCount: updated.likesCount };
      }

      await tx.communityPostLike.create({
        data: {
          postId: post.id,
          userId,
        },
      });

      const updated = await tx.communityPost.update({
        where: { id: post.id },
        data: {
          likesCount: { increment: 1 },
        },
        select: { likesCount: true },
      });

      return { liked: true, likesCount: updated.likesCount };
    });

    if (result.liked && post.userId !== userId) {
      const likingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      await createNotification({
        userId: post.userId,
        tenantId: post.tenantId ?? null,
        createdById: userId,
        type: "community",
        title: "Your post received a new like",
        message: `${likingUser?.name ?? "A community member"} liked your community post.`,
        actionUrl: `/community?post=${post.id}`,
        metadata: { postId: post.id },
      });
    }

    res.json({ success: true, ...result });
  });

  app.post("/api/community/posts/:id/report", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const details = typeof req.body?.details === "string" ? req.body.details.trim() : "";

    if (reason.length < 3) {
      return res.status(400).json({ error: "Please select or enter a valid report reason" });
    }

    const post = await prisma.communityPost.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, userId: true },
    });

    if (!post || post.status !== "approved") {
      return res.status(404).json({ error: "Community post not found" });
    }

    if (post.userId === userId) {
      return res.status(400).json({ error: "You cannot report your own post" });
    }

    const report = await prisma.communityPostReport.upsert({
      where: {
        postId_userId: {
          postId: post.id,
          userId,
        },
      },
      update: {
        reason,
        details: details || null,
        status: "open",
        moderatedAt: null,
        moderatedById: null,
      },
      create: {
        postId: post.id,
        userId,
        reason,
        details: details || null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        post: { select: { content: true } },
      },
    });

    await handleAuditLog(userId, "community.post.reported", "community_post_report", report.id, {
      postId: post.id,
      reason,
    });

    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          createdById: userId,
          type: "community",
          title: "New community report",
          message: `${report.user?.name || "A user"} reported a community post for ${reason}.`,
          actionUrl: `/admin/community?report=${report.id}`,
          metadata: {
            reportId: report.id,
            postId: post.id,
            reason,
            reporterId: userId,
          },
        }),
      ),
    );

    res.json({ success: true, report: serializeCommunityReport(report) });
  });

  app.get("/api/admin/community/posts", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    const [posts, comments, reports] = await Promise.all([
      prisma.communityPost.findMany({
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
          product: {
            select: { id: true, name: true, slug: true, category: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.communityPostComment.findMany({
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
          post: {
            select: { id: true, content: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 150,
      }),
      prisma.communityPostReport.findMany({
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
          post: {
            select: { id: true, content: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    res.json({
      posts: posts.map((post) => ({
        ...serializeCommunityPost(post, null),
        moderation_note: post.moderationNote ?? null,
      })),
      comments: comments.map((comment) => ({
        ...serializeCommunityComment(comment),
        post_id: comment.postId,
        post_excerpt: comment.post?.content?.slice(0, 120) ?? "",
        moderation_note: comment.moderationNote ?? null,
      })),
      reports: reports.map(serializeCommunityReport),
    });
  });

  app.post("/api/admin/community/posts/:id/moderate", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    const moderationNote = typeof req.body?.moderation_note === "string" ? req.body.moderation_note.trim() : "";

    if (!["approved", "hidden", "rejected"].includes(status)) {
      return res.status(400).json({ error: "A valid moderation status is required" });
    }

    const updated = await prisma.communityPost.update({
      where: { id: req.params.id },
      data: {
        status,
        moderationNote: moderationNote || null,
        moderatedAt: new Date(),
        moderatedById: String(req.user.id),
      },
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
        product: {
          select: { id: true, name: true, slug: true, image: true, category: true, price: true, reviewsCount: true },
        },
        likes: {
          select: { userId: true },
        },
        comments: {
          where: { status: "visible" },
          select: { id: true },
        },
      },
    });

    await handleAuditLog(String(req.user.id), "admin.community.post.moderated", "community_post", updated.id, {
      status,
    });

    await createNotification({
      userId: updated.user.id,
      createdById: String(req.user.id),
      type: "community",
      title: status === "approved" ? "Community post approved" : status === "hidden" ? "Community post hidden" : "Community post rejected",
      message:
        status === "approved"
          ? "Your community post is now visible in the feed."
          : moderationNote || "Your community post was moderated. Please review the update.",
      actionUrl: `/community?post=${updated.id}`,
      metadata: {
        postId: updated.id,
        status,
      },
    });

    res.json({ success: true, post: serializeCommunityPost(updated, null) });
  });

  app.post("/api/admin/community/comments/:id/moderate", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    const moderationNote = typeof req.body?.moderation_note === "string" ? req.body.moderation_note.trim() : "";

    if (!["visible", "hidden"].includes(status)) {
      return res.status(400).json({ error: "A valid comment moderation status is required" });
    }

    const existing = await prisma.communityPostComment.findUnique({
      where: { id: req.params.id },
      select: { id: true, postId: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const comment = await tx.communityPostComment.update({
        where: { id: existing.id },
        data: {
          status,
          moderationNote: moderationNote || null,
          moderatedAt: new Date(),
          moderatedById: String(req.user.id),
        },
        include: {
          user: {
            select: { id: true, name: true, role: true },
          },
          post: {
            select: { id: true },
          },
        },
      });

      if (existing.status !== status) {
        await tx.communityPost.update({
          where: { id: existing.postId },
          data: {
            commentsCount:
              status === "visible"
                ? { increment: 1 }
                : existing.status === "visible"
                  ? { decrement: 1 }
                  : undefined,
          },
        });
      }

      return comment;
    });

    await handleAuditLog(String(req.user.id), "admin.community.comment.moderated", "community_post_comment", updated.id, {
      status,
    });

    await createNotification({
      userId: updated.user.id,
      createdById: String(req.user.id),
      type: "community",
      title: status === "visible" ? "Comment approved" : "Comment hidden",
      message:
        status === "visible"
          ? "Your community comment is visible again."
          : moderationNote || "Your community comment was moderated. Please review the update.",
      actionUrl: updated.post?.id ? `/community?post=${updated.post.id}` : "/community",
      metadata: {
        commentId: updated.id,
        postId: updated.post?.id ?? existing.postId,
        status,
      },
    });

    res.json({ success: true, comment: serializeCommunityComment(updated) });
  });

  app.post("/api/admin/community/reports/:id/review", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    if (!["open", "reviewed", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "A valid report review status is required" });
    }

    const updated = await prisma.communityPostReport.update({
      where: { id: req.params.id },
      data: {
        status,
        moderatedAt: new Date(),
        moderatedById: String(req.user.id),
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        post: { select: { content: true } },
      },
    });

    await handleAuditLog(String(req.user.id), "admin.community.report.reviewed", "community_post_report", updated.id, {
      status,
    });

    res.json({ success: true, report: serializeCommunityReport(updated) });
  });

  app.get("/api/products", async (req: any, res) => {
    try {
      const limit = Number.parseInt(String(req.query.limit || ""), 10);
      const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
      const sellerId = typeof req.query.seller_id === "string" ? req.query.seller_id.trim() : "";
      const products = await prisma.product.findMany({
        where: getPublicPublishedProductWhere({
          ...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
          ...(sellerId ? { sellerId } : {}),
        }),
        include: {
          seller: {
            select: {
              id: true,
              name: true,
              storeName: true,
              responseTimeHours: true,
              products: {
                select: {
                  rating: true,
                },
              },
              verificationSubmission: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        ...(Number.isFinite(limit) && limit > 0 ? { take: limit } : {}),
      });
      res.json(products.map(serializeProduct));
    } catch (error) {
      logServerError("load public products", error, {
        limit: req.query.limit,
        category: req.query.category,
        sellerId: req.query.seller_id,
      });
      res.setHeader("X-Data-Source", "fallback");
      return res.status(200).json([]);
    }
  });

  app.get("/api/products/:id/reviews", async (req, res) => {
    try {
      const payload = await getOrSetCache(
        `product:reviews:${req.params.id}`,
        async () => {
          const reviews = await prisma.review.findMany({
            where: { productId: req.params.id },
            include: {
              user: {
                select: { name: true },
              },
            },
            orderBy: { createdAt: "desc" },
          });
          return reviews.map(serializeReview);
        },
        120,
      );
      res.json(payload);
    } catch (error) {
      logServerError("load product reviews", error, { productId: req.params.id });
      res.setHeader("X-Data-Source", "fallback");
      res.json([]);
    }
  });

  app.post("/api/products/:id/reviews", authenticateToken, async (req: any, res) => {
    const { rating, comment } = req.body;
    const productId = req.params.id;
    const userId = req.user.id;

    try {
      await prisma.review.create({
        data: {
          productId,
          userId: String(userId),
          rating: Number(rating),
          comment,
        },
      });

      const stats = await prisma.review.aggregate({
        where: { productId },
        _avg: { rating: true },
        _count: { _all: true },
      });

      await prisma.product.update({
        where: { id: productId },
        data: {
          rating: stats._avg.rating ?? 0,
          reviewsCount: stats._count._all,
        },
      });

      await invalidateProductCache(productId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to post review" });
    }
  });

  app.get("/api/products/:slug", async (req, res) => {
    try {
      const product = await getOrSetCache(
        `product:slug:${req.params.slug}`,
        async () => {
          const row = await prisma.product.findUnique({
            where: { slug: req.params.slug },
            include: {
              seller: {
                select: {
                  id: true,
                  name: true,
                  storeName: true,
                  sellerStatus: true,
                  storefrontPublished: true,
                  responseTimeHours: true,
                  products: {
                    select: {
                      rating: true,
                    },
                  },
                  verificationSubmission: {
                    select: {
                      status: true,
                    },
                  },
                },
              },
            },
          });
          if (
            !row ||
            row.productStatus !== PRODUCT_STATUSES.published ||
            !isSellerApproved(row.seller?.sellerStatus) ||
            !Boolean(row.seller?.storefrontPublished)
          ) {
            return null;
          }
          return serializeProduct(row);
        },
        300,
      );
      if (product) {
        res.json(product);
      } else {
        res.status(404).json({ error: "Product not found" });
      }
    } catch (error) {
      logServerError("load public product by slug", error, { slug: req.params.slug });
      res.setHeader("X-Data-Source", "fallback");
      res.status(404).json({ error: "Product not found" });
    }
  });

  app.get("/api/products/id/:id", async (req, res) => {
    try {
      const product = await getOrSetCache(
        `product:id:${req.params.id}`,
        async () => {
          const row = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: {
              seller: {
                select: {
                  id: true,
                  name: true,
                  sellerStatus: true,
                  storefrontPublished: true,
                },
              },
            },
          });
          if (
            !row ||
            row.productStatus !== PRODUCT_STATUSES.published ||
            !isSellerApproved(row.seller?.sellerStatus) ||
            !Boolean(row.seller?.storefrontPublished)
          ) {
            return null;
          }
          return serializeProduct(row);
        },
        300,
      );
      if (product) {
        res.json(product);
      } else {
        res.status(404).json({ error: "Product not found" });
      }
    } catch (error) {
      logServerError("load public product by id", error, { id: req.params.id });
      res.setHeader("X-Data-Source", "fallback");
      res.status(404).json({ error: "Product not found" });
    }
  });

  app.post("/api/products", authenticateToken, async (req: any, res) => {
    const {
      name,
      description,
      price,
      old_price,
      image,
      gallery_images,
      video_url,
      category,
      stock,
      variant_options,
      specifications,
      reseller_enabled,
      reseller_base_price,
      reseller_suggested_price,
      reseller_notes,
    } = req.body;
    const sellerId = req.user.id;
    const slug = name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '') + '-' + Date.now();
    const normalizedVariantOptions = normalizeVariantOptions(variant_options);
    const normalizedSpecifications = normalizeSpecifications(specifications);
    const normalizedGalleryImages = normalizeGalleryImages(gallery_images);
    const resellerEnabled = Boolean(reseller_enabled);
    const resellerBasePrice =
      reseller_base_price === null || reseller_base_price === "" || typeof reseller_base_price === "undefined"
        ? null
        : Number(reseller_base_price);
    const resellerSuggestedPrice =
      reseller_suggested_price === null || reseller_suggested_price === "" || typeof reseller_suggested_price === "undefined"
        ? null
        : Number(reseller_suggested_price);

    if (resellerEnabled && (resellerBasePrice === null || !Number.isFinite(resellerBasePrice) || resellerBasePrice <= 0)) {
      return res.status(400).json({ error: "Set a valid reseller base price before enabling reseller sales." });
    }

    try {
      const seller = await prisma.user.findUnique({
        where: { id: String(sellerId) },
        select: { role: true, sellerStatus: true },
      });
      const productStatus =
        seller?.role === "seller" && !isSellerApproved(seller?.sellerStatus)
          ? PRODUCT_STATUSES.draft
          : PRODUCT_STATUSES.published;
      const sku = await generateUniqueProductSku(name, category);
      const product = await prisma.product.create({
        data: {
          sku,
          name,
          slug,
          description,
          specifications: normalizedSpecifications,
          price: Number(price),
          oldPrice: Number(old_price || price),
          image: image || '',
          galleryImages: normalizedGalleryImages,
          videoUrl: video_url ? String(video_url).trim() : null,
          category,
          stock: Number(stock ?? 0),
          variantOptions: normalizedVariantOptions,
          resellerEnabled,
          resellerBasePrice,
          resellerSuggestedPrice,
          resellerNotes: reseller_notes ? String(reseller_notes) : null,
          sellerId: String(sellerId),
          productStatus,
          publishedAt: productStatus === PRODUCT_STATUSES.published ? new Date() : null,
        } as any,
      });

      await invalidateProductCache(product.id);
      await invalidatePricingCache(product.id);
      res.json({ success: true, productId: product.id, sku, product_status: productStatus });
    } catch (error) {
      res.status(500).json({ error: "Failed to add product" });
    }
  });

  app.put("/api/products/:id", authenticateToken, async (req: any, res) => {
    const {
      name,
      description,
      price,
      old_price,
      image,
      gallery_images,
      video_url,
      category,
      stock,
      variant_options,
      specifications,
      reseller_enabled,
      reseller_base_price,
      reseller_suggested_price,
      reseller_notes,
    } = req.body;
    const sellerId = req.user.id;
    const productId = req.params.id;
    const userRole = req.user.role;
    const normalizedVariantOptions = normalizeVariantOptions(variant_options);
    const normalizedSpecifications = normalizeSpecifications(specifications);
    const normalizedGalleryImages = normalizeGalleryImages(gallery_images);
    const resellerEnabled = Boolean(reseller_enabled);
    const resellerBasePrice =
      reseller_base_price === null || reseller_base_price === "" || typeof reseller_base_price === "undefined"
        ? null
        : Number(reseller_base_price);
    const resellerSuggestedPrice =
      reseller_suggested_price === null || reseller_suggested_price === "" || typeof reseller_suggested_price === "undefined"
        ? null
        : Number(reseller_suggested_price);

    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) return res.status(404).json({ error: "Product not found" });

      if (userRole !== 'admin' && product.sellerId !== String(sellerId)) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (resellerEnabled && (resellerBasePrice === null || !Number.isFinite(resellerBasePrice) || resellerBasePrice <= 0)) {
        return res.status(400).json({ error: "Set a valid reseller base price before enabling reseller sales." });
      }

      const owner = userRole === "seller"
        ? await prisma.user.findUnique({
            where: { id: String(sellerId) },
            select: { sellerStatus: true },
          })
        : null;
      const nextProductStatus =
        userRole === "admin" || isSellerApproved(owner?.sellerStatus)
          ? PRODUCT_STATUSES.published
          : product.productStatus ?? PRODUCT_STATUSES.draft;

      await prisma.product.update({
        where: { id: productId },
        data: {
          sku: product.sku || (await generateUniqueProductSku(name || product.name, category || product.category)),
          name,
          description,
          specifications: normalizedSpecifications,
          price: Number(price),
          oldPrice: Number(old_price || price),
          image,
          galleryImages: normalizedGalleryImages,
          videoUrl: video_url ? String(video_url).trim() : null,
          category,
          stock: Number(stock ?? 0),
          variantOptions: normalizedVariantOptions,
          resellerEnabled,
          resellerBasePrice,
          resellerSuggestedPrice,
          resellerNotes: reseller_notes ? String(reseller_notes) : null,
          productStatus: nextProductStatus,
          publishedAt:
            nextProductStatus === PRODUCT_STATUSES.published
              ? product.publishedAt ?? new Date()
              : null,
        } as any,
      });

      await invalidateProductCache(productId);
      await invalidatePricingCache(productId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/products/:id", authenticateToken, async (req: any, res) => {
    const productId = req.params.id;
    const sellerId = req.user.id;
    const userRole = req.user.role;

    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) return res.status(404).json({ error: "Product not found" });

      if (userRole !== 'admin' && product.sellerId !== String(sellerId)) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await prisma.product.delete({
        where: { id: productId },
      });
      await invalidateProductCache(productId);
      await invalidatePricingCache(productId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  app.post("/api/orders", authenticateToken, async (req: any, res: any) => {
    const { total, couponCode, paymentMethod, shippingAddress, items, refCode } = req.body;
    const userId = req.user.id;

    try {
      if (!(await isCheckoutPaymentMethodEnabled(paymentMethod))) {
        return res.status(400).json({ error: "Only Cash on delivery is available right now." });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Order items are required" });
      }

      const productIds = items.map((item) => String(item.id));
      const resellerId = await getResellerIdFromOrderRefCode(typeof refCode === "string" ? refCode : null);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          stock: true,
          sellerId: true,
          productStatus: true,
          price: true,
          resellerEnabled: true,
          resellerBasePrice: true,
          seller: {
            select: {
              id: true,
              sellerStatus: true,
              storefrontPublished: true,
            },
          },
          inventoryItems: {
            select: {
              warehouseId: true,
              quantity: true,
              warehouse: {
                select: {
                  id: true,
                  name: true,
                  city: true,
                  managerId: true,
                },
              },
            },
            orderBy: [
              { quantity: 'desc' },
            ],
          },
        },
      });

      const stockById = new Map<string, number>(products.map((product) => [product.id, Number(product.stock)]));
      const productById = new Map(products.map((product) => [product.id, product]));
      const resellerMarkupRows = resellerId
        ? await prismaDirect.resellerMarkup.findMany({
            where: {
              resellerId,
              productId: {
                in: productIds,
              },
            },
            select: {
              productId: true,
              markupAmount: true,
            },
          })
        : [];
      const resellerMarkupMap = new Map(
        resellerMarkupRows.map((row) => [row.productId, Number(toPlainNumber(row.markupAmount) || 0)]),
      );

      const normalizedOrderItems = items.map((item: any) => {
        const product = productById.get(String(item.id));
        const requestedQuantity = Number(item.quantity);
        const fallbackPrice = Number(item.price ?? 0);
        let effectivePrice = fallbackPrice;

        if (resellerId && product?.resellerEnabled) {
          const basePrice = Number(toPlainNumber(product.resellerBasePrice ?? 0) || 0);
          const markupAmount = resellerMarkupMap.get(String(item.id));
          if (Number.isFinite(markupAmount as number)) {
            effectivePrice = Number((basePrice + Number(markupAmount || 0)).toFixed(2));
          } else if (Number.isFinite(basePrice) && basePrice > 0) {
            effectivePrice = Math.max(fallbackPrice, basePrice);
          }
        } else if (product) {
          effectivePrice = Number(toPlainNumber(product.price) || fallbackPrice || 0);
        }

        return {
          ...item,
          quantity: requestedQuantity,
          price: effectivePrice,
        };
      });

      const grossOrderTotal = Number(
        normalizedOrderItems.reduce(
          (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
          0,
        ),
      );

      const couponSellerIds = [...new Set(products.map((product) => String(product.sellerId || "")).filter(Boolean))];
      const couponScopedSellerId = couponSellerIds.length === 1 ? couponSellerIds[0] : null;
      const validatedCoupon = couponCode
        ? await validateCouponForCart({
            code: couponCode,
            orderValue: grossOrderTotal,
            sellerId: couponScopedSellerId,
            productIds,
          })
        : null;
      const couponDiscountAmount = validatedCoupon
        ? validatedCoupon.discount_type === "percentage"
          ? (grossOrderTotal * Number(validatedCoupon.discount_value || 0)) / 100
          : Number(validatedCoupon.discount_value || 0)
        : 0;
      const finalOrderTotal = Math.max(0, grossOrderTotal - Math.min(grossOrderTotal, couponDiscountAmount));

      for (const item of normalizedOrderItems) {
        const currentStock = stockById.get(String(item.id));
        if (currentStock === undefined) {
          return res.status(404).json({ error: `Product ${item.id} not found` });
        }
        const product = productById.get(String(item.id));
        if (
          !product ||
          product.productStatus !== PRODUCT_STATUSES.published ||
          !isSellerApproved(product.seller?.sellerStatus) ||
          !Boolean(product.seller?.storefrontPublished)
        ) {
          return res.status(403).json({ error: "One or more products are not available for sale right now." });
        }
        if (currentStock < Number(item.quantity)) {
          return res.status(400).json({ error: `Insufficient stock for product ${item.id}` });
        }
      }

      const orderCode = await generateUniqueOrderCode();
      const createdOrder = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderCode,
            userId: String(userId),
            tenantId: req.user.tenantId ?? null,
            total: Number(finalOrderTotal.toFixed(2)),
            status: "processing",
            paymentMethod,
            paymentStatus: "pending",
            refCode: refCode || null,
            shippingAddress,
            items: {
              create: normalizedOrderItems.map((item: any) => ({
                productId: String(item.id),
                qty: Number(item.quantity),
                price: Number(item.price),
                variantSummary: typeof item.selected_variant_summary === "string" ? item.selected_variant_summary : null,
                variantSku: typeof item.selected_variant_sku === "string" ? item.selected_variant_sku : null,
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
          items: Array<{ orderItemId: string; productId: string; qty: number; price: number }>;
        }>();

        for (const item of normalizedOrderItems) {
          const product = productById.get(String(item.id));
          if (!product || !product.sellerId) {
            continue;
          }

          const selectedWarehouse = product.inventoryItems.find((inventoryItem) => Number(inventoryItem.quantity) > 0)?.warehouseId ?? null;
          const key = `${product.sellerId}::${selectedWarehouse ?? 'unassigned'}`;
          const group = shipmentGroups.get(key) ?? {
            sellerId: product.sellerId,
            warehouseId: selectedWarehouse,
            total: 0,
            itemCount: 0,
            items: [],
          };

          const linkedOrderItems = orderItemsByProductId.get(String(item.id)) ?? [];
          const linkedOrderItem = linkedOrderItems.shift();
          orderItemsByProductId.set(String(item.id), linkedOrderItems);

          if (!linkedOrderItem) {
            continue;
          }

          group.total += Number(linkedOrderItem.price) * Number(linkedOrderItem.qty);
          group.itemCount += Number(linkedOrderItem.qty);
          group.items.push({
            orderItemId: linkedOrderItem.id,
            productId: String(item.id),
            qty: Number(linkedOrderItem.qty),
            price: Number(linkedOrderItem.price),
          });
          shipmentGroups.set(key, group);
        }

        for (const group of shipmentGroups.values()) {
          const shipment = await tx.orderShipment.create({
            data: {
              orderId: order.id,
              sellerId: group.sellerId,
              warehouseId: group.warehouseId,
              status: 'processing',
              total: group.total,
              itemCount: group.itemCount,
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

        const lowStockAlerts: Array<{
          id: string;
          stock: number;
          name: string;
          sellerId: string | null;
          warehouseId: string | null;
          warehouseName: string | null;
        }> = [];
        const stockUpdates: Array<{ id: string; stock: number }> = [];

        for (const item of normalizedOrderItems) {
          const updated = await tx.product.update({
            where: { id: String(item.id) },
            data: {
              stock: {
                decrement: Number(item.quantity),
              },
            },
            select: {
              id: true,
              stock: true,
            },
          });
          const productMeta = productById.get(String(item.id));
          if (
            productMeta &&
            Number(updated.stock) <= env.LOW_STOCK_THRESHOLD
          ) {
            const selectedInventoryItem =
              productMeta.inventoryItems.find((inventoryItem) => Number(inventoryItem.quantity) > 0) ??
              productMeta.inventoryItems[0] ??
              null;
            lowStockAlerts.push({
              id: String(updated.id),
              stock: Number(updated.stock),
              name: String((item as { name?: string }).name || ''),
              sellerId: productMeta.sellerId ?? null,
              warehouseId: selectedInventoryItem?.warehouseId ?? null,
              warehouseName: selectedInventoryItem?.warehouse?.name ?? null,
            });
          }
          stockUpdates.push({
            id: String(updated.id),
            stock: Number(updated.stock),
          });
        }

        return {
          ...order,
          lowStockAlerts,
          stockUpdates,
        };
      }, {
        maxWait: 10_000,
        timeout: 20_000,
      });

      const redis = await ensureRedis();
      await redis.del(userCartKey(userId));
      const orderRevenueTotal = normalizedOrderItems.reduce(
        (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      );
      if (Array.isArray(createdOrder.stockUpdates)) {
        for (const update of createdOrder.stockUpdates) {
          emitStockUpdate(update.id as any, update.stock);
        }
      }
      notifyOrderPlaced(userId, createdOrder.id as any, Number(orderRevenueTotal));
      if (Array.isArray(createdOrder.lowStockAlerts) && createdOrder.lowStockAlerts.length > 0) {
        const notifiedProductIds = new Set<string>();
        for (const product of createdOrder.lowStockAlerts) {
          if (!product.sellerId || notifiedProductIds.has(product.id)) continue;
          notifiedProductIds.add(product.id);
          await createNotification({
            userId: product.sellerId,
            type: 'inventory',
            title: product.stock <= 2 ? 'Critical stock alert' : 'Low stock alert',
            message:
              product.stock <= 2
                ? `A recent order pushed product ${product.id} down to ${product.stock} unit${product.stock === 1 ? '' : 's'}${product.warehouseName ? ` at ${product.warehouseName}` : ''}. Restock urgently.`
                : `Product ${product.id} is now at ${product.stock} units and below your stock threshold.`,
            actionUrl:
              product.stock <= 2
                ? product.warehouseId
                  ? `/seller/pickup-locations?warehouse=${encodeURIComponent(product.warehouseId)}`
                  : `/seller/products/edit/${encodeURIComponent(product.id)}`
                : `/seller/products?search=${encodeURIComponent(product.id)}&product=${encodeURIComponent(product.id)}`,
            metadata: {
              productId: product.id,
              stock: product.stock,
              orderId: String(createdOrder.id),
              warehouseId: product.warehouseId,
              warehouseName: product.warehouseName,
            },
          });

          if (product.stock <= 2) {
            const admins = await getActiveAdminUsers();
            await Promise.all(
              admins.map((admin) =>
                createNotification({
                  userId: admin.id,
                  type: 'inventory',
                  title: 'Critical stock requires review',
                  message: `Product ${product.id} has dropped to ${product.stock} unit${product.stock === 1 ? '' : 's'} after order ${createdOrder.id}.`,
                  actionUrl: `/admin/inventory?section=po&product=${encodeURIComponent(product.id)}`,
                  metadata: {
                    productId: product.id,
                    stock: product.stock,
                    orderId: String(createdOrder.id),
                    severity: 'critical',
                  },
                }),
              ),
            );
          }
        }
      }
      void enqueueOrderProcessing({
        orderId: String(createdOrder.id),
        userId: String(userId),
        tenantId: req.user.tenantId ?? null,
      });

      const tenantSetting = await ensureTenantSetting(req.user.tenantId ?? null);
      const cashbackAmount = Number(finalOrderTotal) * ((tenantSetting?.orderCashbackBps ?? 0) / 10000);
      if (cashbackAmount > 0) {
        await grantReward({
          userId: String(userId),
          tenantId: req.user.tenantId ?? null,
          eventType: "order_cashback",
          source: "order",
          description: `Cashback reward for order ${createdOrder.id}`,
          walletAmount: Number(cashbackAmount.toFixed(2)),
          referenceId: String(createdOrder.id),
        });
      }

      if (Math.random() <= (tenantSetting?.surpriseRewardChance ?? 0)) {
        await grantReward({
          userId: String(userId),
          tenantId: req.user.tenantId ?? null,
          eventType: "surprise_reward",
          source: "order",
          description: `Surprise post-checkout reward for order ${createdOrder.id}`,
          coins: 50,
          referenceId: String(createdOrder.id),
        });
      }

      await updateMissionProgress(String(userId), "first-order", 1);
      await updateMissionProgress(String(userId), "multi-order", 1);
      await createNotification({
        userId: String(userId),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Order placed successfully",
        message: `Order ${createdOrder.id} is confirmed and is now being processed.`,
        actionUrl: `/order-success?orderId=${createdOrder.id}`,
      });
      res.json({ success: true, orderId: createdOrder.id });
    } catch (error) {
      res.status(500).json({ error: "Failed to place order" });
    }
  });

  app.get("/api/orders/my-orders", authenticateToken, async (req: any, res) => {
    const orders = await prisma.order.findMany({
      where: { userId: String(req.user.id) },
      orderBy: { createdAt: "desc" },
      include: {
        shipments: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    res.json(orders.map(serializeOrder));
  });

  app.get("/api/orders/:id", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                image: true,
                sku: true,
                seller: {
                  select: {
                    id: true,
                    name: true,
                    storeName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        shipments: {
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                storeName: true,
                email: true,
                phone: true,
              },
            },
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
            items: {
              include: {
                product: {
                  select: {
                    name: true,
                    image: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const returnRequest = await prisma.accountActionRequest.findFirst({
      where: {
        userId: String(req.user.id),
        orderId: order.id,
        type: "return_request",
      } as any,
      orderBy: { createdAt: "desc" },
    });

    res.json({
      ...serializeOrder(order),
      items: order.items.map(serializeOrderItem),
      return_request: returnRequest ? serializeAccountActionRequest(returnRequest) : null,
    });
  });

  app.post("/api/orders/:id/cancel", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        items: true,
        shipments: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const controls = getCustomerOrderActionState(order);
    if (!controls.canCancel) {
      return res.status(409).json({ error: controls.blockReason || "This order can no longer be cancelled." });
    }

    try {
      const updatedOrder = await prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: Number(item.qty || 0),
              },
            },
          });
        }

        await tx.orderShipment.updateMany({
          where: { orderId: order.id },
          data: {
            status: "cancelled",
          },
        });

        return tx.order.update({
          where: { id: order.id },
          data: {
            status: "cancelled",
            paymentStatus: order.paymentMethod === "cod" ? "cancelled" : order.paymentStatus,
            failureReason: "Cancelled by customer before seller acceptance",
          },
          include: {
            shipments: true,
          },
        });
      });

      const uniqueSellerIds = [...new Set(order.shipments.map((shipment) => String(shipment.sellerId || "")).filter(Boolean))];

      await Promise.all([
        createNotification({
          userId: String(req.user.id),
          tenantId: order.tenantId ?? null,
          type: "order_update",
          title: "Order cancelled",
          message: `Order ${order.orderCode || order.id} was cancelled before seller acceptance.`,
          actionUrl: `/account/orders/${order.id}`,
          metadata: {
            orderId: order.id,
            status: "cancelled",
            source: "customer_cancel",
          },
        }),
        ...uniqueSellerIds.map((sellerId) =>
          createNotification({
            userId: sellerId,
            tenantId: order.tenantId ?? null,
            createdById: String(req.user.id),
            type: "order_update",
            title: "Customer cancelled an order",
            message: `Order ${order.orderCode || order.id} was cancelled before you accepted it.`,
            actionUrl: `/seller/orders?order=${encodeURIComponent(order.id)}`,
            metadata: {
              orderId: order.id,
              status: "cancelled",
              source: "customer_cancel",
            },
          }),
        ),
      ]);

      res.json({
        success: true,
        order: serializeOrder(updatedOrder),
      });
    } catch (error) {
      logServerError("cancel customer order", error, { userId: String(req.user.id), orderId: req.params.id });
      res.status(500).json({ error: "Failed to cancel order" });
    }
  });

  app.post("/api/orders/:id/edit", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        items: true,
        shipments: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const controls = getCustomerOrderActionState(order);
    if (!controls.canEdit) {
      return res.status(409).json({ error: controls.blockReason || "This order can no longer be edited." });
    }

    const productIds = [...new Set(order.items.map((item) => String(item.productId)).filter(Boolean))];
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            storeName: true,
            responseTimeHours: true,
            verificationSubmission: {
              select: {
                status: true,
              },
            },
            products: {
              select: {
                rating: true,
              },
            },
          },
        },
      },
    });

    if (products.length !== productIds.length) {
      return res.status(409).json({ error: "Some products in this order are no longer available for editing." });
    }

    const editableCartItems = buildEditableCartItemsFromOrder(order, products);

    try {
      const updatedOrder = await prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                increment: Number(item.qty || 0),
              },
            },
          });
        }

        await tx.orderShipment.updateMany({
          where: { orderId: order.id },
          data: {
            status: "cancelled",
          },
        });

        return tx.order.update({
          where: { id: order.id },
          data: {
            status: "cancelled",
            paymentStatus: order.paymentMethod === "cod" ? "cancelled" : order.paymentStatus,
            failureReason: "Customer reopened order for edits before seller acceptance",
          },
          include: {
            shipments: true,
          },
        });
      });

      const uniqueSellerIds = [...new Set(order.shipments.map((shipment) => String(shipment.sellerId || "")).filter(Boolean))];

      await Promise.all([
        createNotification({
          userId: String(req.user.id),
          tenantId: order.tenantId ?? null,
          type: "order_update",
          title: "Order reopened for edits",
          message: `Order ${order.orderCode || order.id} was moved back to your cart before seller acceptance.`,
          actionUrl: `/cart`,
          metadata: {
            orderId: order.id,
            status: "cancelled",
            source: "customer_edit",
          },
        }),
        ...uniqueSellerIds.map((sellerId) =>
          createNotification({
            userId: sellerId,
            tenantId: order.tenantId ?? null,
            createdById: String(req.user.id),
            type: "order_update",
            title: "Customer reopened an order",
            message: `Order ${order.orderCode || order.id} was returned to the customer's cart before you accepted it.`,
            actionUrl: `/seller/orders?order=${encodeURIComponent(order.id)}`,
            metadata: {
              orderId: order.id,
              status: "cancelled",
              source: "customer_edit",
            },
          }),
        ),
      ]);

      res.json({
        success: true,
        order: serializeOrder(updatedOrder),
        cart_items: editableCartItems,
      });
    } catch (error) {
      logServerError("edit customer order", error, { userId: String(req.user.id), orderId: req.params.id });
      res.status(500).json({ error: "Failed to reopen order for editing" });
    }
  });

  app.get("/api/orders/:id/invoice", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                seller: {
                  select: {
                    id: true,
                    name: true,
                    storeName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        shipments: {
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                storeName: true,
                email: true,
                phone: true,
              },
            },
            warehouse: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const shippingAddress =
      order.shippingAddress && typeof order.shippingAddress === "object"
        ? (order.shippingAddress as Record<string, any>)
        : {};

    const html = buildInvoiceHtml(order, shippingAddress);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"invoice-${order.id}.html\"`);
    res.send(html);
  });

  app.get("/api/orders/:id/invoice.pdf", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
      include: {
        user: {
          select: {
            email: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
                sku: true,
                seller: {
                  select: {
                    id: true,
                    name: true,
                    storeName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        shipments: {
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                storeName: true,
                email: true,
                phone: true,
              },
            },
            warehouse: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const shippingAddress =
      order.shippingAddress && typeof order.shippingAddress === "object"
        ? (order.shippingAddress as Record<string, any>)
        : {};

    const pdfBuffer = buildInvoicePdf(order, shippingAddress);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"invoice-${order.id}.pdf\"`);
    res.setHeader("Content-Length", String(pdfBuffer.length));
    res.send(pdfBuffer);
  });

  app.post("/api/orders/:id/return-request", authenticateToken, async (req: any, res) => {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        userId: String(req.user.id),
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (!["delivered", "returned"].includes(String(order.status))) {
      return res.status(400).json({ error: "Return requests are available only after delivery." });
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 10) {
      return res.status(400).json({ error: "Please provide a clear return reason with at least 10 characters." });
    }

    const existing = await prisma.accountActionRequest.findFirst({
      where: {
        userId: String(req.user.id),
        orderId: order.id,
        type: "return_request",
        status: { in: ["pending", "approved"] },
      } as any,
    });

    if (existing) {
      return res.status(409).json({ error: "A return request for this order is already active." });
    }

    const request = await prisma.accountActionRequest.create({
      data: {
        userId: String(req.user.id),
        orderId: order.id,
        type: "return_request",
        status: "pending",
        reason,
      } as any,
    });

    await createNotification({
      userId: String(req.user.id),
      tenantId: order.tenantId ?? null,
      type: "account_action",
      title: "Return request received",
      message: `Your return request for order ${order.id} has been submitted for review.`,
      actionUrl: `/account/orders/${order.id}?return=${request.id}`,
      metadata: { orderId: order.id, requestId: request.id, type: "return_request" },
    });

    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          tenantId: order.tenantId ?? null,
          createdById: String(req.user.id),
          type: "account_action",
          title: "New return request requires review",
          message: `Order ${order.id} has a new customer return request waiting for review.`,
          actionUrl: `/admin/returns?request=${request.id}&search=${encodeURIComponent(order.id)}`,
          metadata: {
            orderId: order.id,
            requestId: request.id,
            type: "return_request",
            status: "pending",
          },
        }),
      ),
    );

    res.json({ success: true, request: serializeAccountActionRequest(request) });
  });

  app.get("/api/users/profile", authenticateToken, async (req: any, res) => {
    try {
      const userId = String(req.user.id);
      const [user, notificationPreference, verificationSubmission, payoutMethods, payoutTransactions, actionRequests, riskFlags, addresses] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        ensureNotificationPreference(userId),
        prisma.verificationSubmission.findUnique({
          where: { userId },
          include: {
            reviewedBy: { select: { id: true, name: true, email: true } },
            documents: true,
          },
        }),
        prisma.payoutMethod.findMany({
          where: { userId },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        }),
        prisma.payoutTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 25,
        }),
        prisma.accountActionRequest.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.userRiskFlag.findMany({
          where: { userId, isActive: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.address.findMany({
          where: { userId },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        }),
      ]);

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        user: serializeUser(user),
        notification_preferences: serializeNotificationPreference(notificationPreference),
        verification: serializeVerificationSubmission(verificationSubmission),
        payout_methods: payoutMethods.map(serializePayoutMethod),
        transaction_history: payoutTransactions.map(serializePayoutTransaction),
        privacy_requests: actionRequests.map(serializeAccountActionRequest),
        risk_flags: req.user.role === "admin" ? riskFlags.map(serializeRiskFlag) : [],
        addresses: addresses.map(serializeAddress),
      });
    } catch (error) {
      logServerError("load profile", error, { userId: String(req.user.id) });
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  app.patch("/api/users/profile", authenticateToken, async (req: any, res) => {
    const parsed = profileUpdateSchema.safeParse({
      ...req.body,
      response_time_hours:
        req.body?.response_time_hours === null || typeof req.body?.response_time_hours === "undefined"
          ? undefined
          : Number(req.body.response_time_hours),
    });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid profile payload" });
    }

    const userId = String(req.user.id);
    const payload = parsed.data;

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          name: payload.name,
          phone: payload.phone || null,
          alternatePhone: payload.alternate_phone || null,
          bio: payload.bio || null,
          storeName: payload.store_name || null,
          profileVisibility: payload.profile_visibility ?? undefined,
          responseTimeHours: payload.response_time_hours ?? null,
        },
      });

      await handleAuditLog(userId, "profile.updated", "user", userId, {
        profile_visibility: updatedUser.profileVisibility,
      });

      res.json({ success: true, user: serializeUser(updatedUser) });
    } catch (error) {
      logServerError("update profile", error, { userId });
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.post("/api/users/profile/avatar", authenticateToken, rateLimit("profile-avatar", 15, 60_000), async (req: any, res) => {
    try {
      const parsed = uploadAssetSchema.safeParse({
        data_url: req.body?.data_url,
        mime_type: req.body?.mime_type,
        size_bytes: Number(req.body?.size_bytes),
      });

      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid upload payload" });
      }

      validateUploadInput({
        dataUrl: parsed.data.data_url,
        mimeType: parsed.data.mime_type,
        sizeBytes: parsed.data.size_bytes,
      });

      const uploaded = await uploadDataUrlToCloudinary({
        dataUrl: parsed.data.data_url,
        folder: "amarshop/profiles",
        publicIdPrefix: `avatar-${req.user.id}`,
      });

      const updatedUser = await prisma.user.update({
        where: { id: String(req.user.id) },
        data: { avatarUrl: uploaded.url },
      });

      await handleAuditLog(String(req.user.id), "profile.avatar.updated", "user", String(req.user.id), {
        public_id: uploaded.publicId,
      });

      res.json({ success: true, avatar_url: updatedUser.avatarUrl, user: serializeUser(updatedUser) });
    } catch (error: any) {
      const message = getErrorMessage(error);
      logServerError("upload profile avatar", error, { userId: String(req.user.id) });
      const status = message.toLowerCase().includes("invalid") || message.toLowerCase().includes("too large") ? 400 : 500;
      res.status(status).json({ error: message || "Failed to upload avatar" });
    }
  });

  app.get("/api/users/preferences", authenticateToken, async (req: any, res) => {
    const preference = await ensureNotificationPreference(String(req.user.id));
    res.json(serializeNotificationPreference(preference));
  });

  app.patch("/api/users/preferences", authenticateToken, async (req: any, res) => {
    const parsed = notificationPreferenceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid preferences payload" });
    }

    const updated = await prisma.notificationPreference.upsert({
      where: { userId: String(req.user.id) },
      update: {
        emailEnabled: parsed.data.email_enabled,
        smsEnabled: parsed.data.sms_enabled,
        orderUpdates: parsed.data.order_updates,
        marketingOptIn: parsed.data.marketing_opt_in,
        payoutAlerts: parsed.data.payout_alerts,
        securityAlerts: parsed.data.security_alerts,
      },
      create: {
        userId: String(req.user.id),
        emailEnabled: parsed.data.email_enabled,
        smsEnabled: parsed.data.sms_enabled,
        orderUpdates: parsed.data.order_updates,
        marketingOptIn: parsed.data.marketing_opt_in,
        payoutAlerts: parsed.data.payout_alerts,
        securityAlerts: parsed.data.security_alerts,
      },
    });

    await handleAuditLog(String(req.user.id), "profile.preferences.updated", "notification_preference", updated.id);
    res.json({ success: true, preferences: serializeNotificationPreference(updated) });
  });

  app.get("/api/users/payout-methods", authenticateToken, async (req: any, res) => {
    const methods = await prisma.payoutMethod.findMany({
      where: { userId: String(req.user.id) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    res.json(methods.map(serializePayoutMethod));
  });

  app.post("/api/users/payout-methods", authenticateToken, async (req: any, res) => {
    const parsed = payoutMethodSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payout method payload" });
    }

    const userId = String(req.user.id);
    const data = parsed.data;

    if (!["seller", "reseller", "admin"].includes(String(req.user.role))) {
      return res.status(403).json({ error: "Payout methods are only available for seller and reseller accounts" });
    }

    const created = await prisma.$transaction(async (tx) => {
      if (data.is_default) {
        await tx.payoutMethod.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      return tx.payoutMethod.create({
        data: {
          userId,
          type: data.type,
          provider: data.provider,
          accountName: data.account_name || null,
          encryptedAccountNumber: data.account_number ? encryptSensitiveValue(data.account_number) : null,
          encryptedRoutingNumber: data.routing_number ? encryptSensitiveValue(data.routing_number) : null,
          encryptedMobileNumber: data.mobile_number ? encryptSensitiveValue(data.mobile_number) : null,
          accountLast4: (data.account_number || data.mobile_number || "").replace(/\D+/g, "").slice(-4) || null,
          isDefault: data.is_default,
          metadata: data.metadata || undefined,
        },
      });
    });

    await handleAuditLog(userId, "payout_method.created", "payout_method", created.id, { provider: created.provider, type: created.type });
    res.json({ success: true, payout_method: serializePayoutMethod(created) });
  });

  app.patch("/api/users/payout-methods/:id/default", authenticateToken, async (req: any, res) => {
    const method = await prisma.payoutMethod.findFirst({
      where: { id: req.params.id, userId: String(req.user.id) },
    });
    if (!method) return res.status(404).json({ error: "Payout method not found" });

    await prisma.$transaction([
      prisma.payoutMethod.updateMany({
        where: { userId: String(req.user.id) },
        data: { isDefault: false },
      }),
      prisma.payoutMethod.update({
        where: { id: method.id },
        data: { isDefault: true },
      }),
    ]);

    await handleAuditLog(String(req.user.id), "payout_method.default_changed", "payout_method", method.id);
    res.json({ success: true });
  });

  app.delete("/api/users/payout-methods/:id", authenticateToken, async (req: any, res) => {
    const method = await prisma.payoutMethod.findFirst({
      where: { id: req.params.id, userId: String(req.user.id) },
    });
    if (!method) return res.status(404).json({ error: "Payout method not found" });

    await prisma.payoutMethod.delete({ where: { id: method.id } });
    await handleAuditLog(String(req.user.id), "payout_method.deleted", "payout_method", method.id);
    res.json({ success: true });
  });

  app.get("/api/users/transactions", authenticateToken, async (req: any, res) => {
    const [transactions, resellerPayouts] = await Promise.all([
      prisma.payoutTransaction.findMany({
        where: { userId: String(req.user.id) },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      req.user.role === "reseller"
        ? prisma.resellerPayout.findMany({
            where: { resellerId: String(req.user.id) },
            orderBy: { createdAt: "desc" },
            take: 25,
          })
        : Promise.resolve([] as any[]),
    ]);

    res.json({
      transactions: transactions.map(serializePayoutTransaction),
      reseller_payouts: resellerPayouts.map(serializeResellerPayout),
    });
  });

  app.post("/api/users/payout-request", authenticateToken, async (req: any, res) => {
    if (!["seller", "reseller"].includes(String(req.user.role))) {
      return res.status(403).json({ error: "Only seller and reseller accounts can request payouts" });
    }

    if (String(req.user.role) === "seller") {
      const seller = await prisma.user.findUnique({
        where: { id: String(req.user.id) },
        select: { sellerStatus: true },
      });
      if (!isSellerApproved(seller?.sellerStatus)) {
        return res.status(403).json({ error: getSellerApprovalBlockedMessage("payout_withdrawal", seller?.sellerStatus) });
      }
    }

    const amount = Number(req.body?.amount);
    const payoutMethodId = typeof req.body?.payout_method_id === "string" ? req.body.payout_method_id : null;
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "A valid payout amount is required" });
    }

    let payoutMethod = null;
    if (payoutMethodId) {
      payoutMethod = await prisma.payoutMethod.findFirst({
        where: { id: payoutMethodId, userId: String(req.user.id) },
      });
      if (!payoutMethod) {
        return res.status(404).json({ error: "Payout method not found" });
      }
    }

    const transaction = await prisma.payoutTransaction.create({
      data: {
        userId: String(req.user.id),
        payoutMethodId: payoutMethod?.id ?? null,
        type: "payout_request",
        amount,
        currency: "BDT",
        status: "pending",
        notes,
      },
    });

    const requester = await prisma.user.findUnique({
      where: { id: String(req.user.id) },
      select: { id: true, name: true, email: true, tenantId: true },
    });

    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          tenantId: requester?.tenantId ?? null,
          createdById: String(req.user.id),
          type: "payout",
          title: "New payout request",
          message: `${requester?.name || requester?.email || "A seller"} requested a payout of ${amount.toLocaleString()} BDT.`,
          actionUrl: `/admin/payments?search=${encodeURIComponent(transaction.id)}&payout=${transaction.id}`,
          metadata: {
            payoutTransactionId: transaction.id,
            requesterId: requester?.id ?? String(req.user.id),
            requesterEmail: requester?.email ?? null,
            amount,
          },
        }),
      ),
    );

    await handleAuditLog(String(req.user.id), "payout.requested", "payout_transaction", transaction.id, { amount });
    res.json({ success: true, transaction: serializePayoutTransaction(transaction) });
  });

  app.get("/api/users/verification", authenticateToken, async (req: any, res) => {
    const submission = await prisma.verificationSubmission.findUnique({
      where: { userId: String(req.user.id) },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true } },
        documents: true,
      },
    });

    res.json(serializeVerificationSubmission(submission));
  });

  app.post("/api/users/verification", authenticateToken, rateLimit("kyc-submit", 10, 60_000), async (req: any, res) => {
    if (!["seller", "reseller"].includes(String(req.user.role))) {
      return res.status(403).json({ error: "KYC submission is only available for seller and reseller accounts" });
    }

    const parsed = verificationSubmissionSchema.safeParse({
      ...req.body,
      documents: req.body?.documents,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid verification payload" });
    }

    try {
      const uploads = await Promise.all(
        Object.entries(parsed.data.documents).map(async ([key, file]) => {
          if (!file) return null;
          validateUploadInput({
            dataUrl: file.data_url,
            mimeType: file.mime_type,
            sizeBytes: file.size_bytes,
          });

          const uploaded = await uploadDataUrlToCloudinary({
            dataUrl: file.data_url,
            folder: "amarshop/kyc",
            publicIdPrefix: `${req.user.id}-${key}`,
            resourceType: file.mime_type === "application/pdf" ? "raw" : "auto",
          });

          return {
            type: key,
            label: key.replace(/_/g, " "),
            url: uploaded.url,
            publicId: uploaded.publicId,
            mimeType: file.mime_type,
            sizeBytes: file.size_bytes,
          };
        }),
      );

      const filteredUploads = uploads.filter(Boolean) as Array<Record<string, unknown>>;

      const submission = await prisma.$transaction(async (tx) => {
        const existing = await tx.verificationSubmission.findUnique({
          where: { userId: String(req.user.id) },
          include: { documents: true },
        });

        if (existing) {
          await tx.verificationDocument.deleteMany({ where: { verificationId: existing.id } });
        }

        return tx.verificationSubmission.upsert({
          where: { userId: String(req.user.id) },
          update: {
            role: String(req.user.role),
            documentType: parsed.data.document_type,
            businessName: parsed.data.business_name || null,
            businessLicenseUrl: filteredUploads.find((item) => item.type === "business_license")?.url as string | undefined,
            notes: parsed.data.notes || null,
            status: "pending",
            rejectionReason: null,
            submittedAt: new Date(),
            reviewedAt: null,
            reviewedById: null,
            documents: {
              create: filteredUploads.map((item) => ({
                type: String(item.type),
                label: String(item.label),
                url: String(item.url),
                publicId: item.publicId ? String(item.publicId) : null,
                mimeType: item.mimeType ? String(item.mimeType) : null,
                sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
              })),
            },
          },
          create: {
            userId: String(req.user.id),
            role: String(req.user.role),
            documentType: parsed.data.document_type,
            businessName: parsed.data.business_name || null,
            businessLicenseUrl: filteredUploads.find((item) => item.type === "business_license")?.url as string | undefined,
            notes: parsed.data.notes || null,
            status: "pending",
            documents: {
              create: filteredUploads.map((item) => ({
                type: String(item.type),
                label: String(item.label),
                url: String(item.url),
                publicId: item.publicId ? String(item.publicId) : null,
                mimeType: item.mimeType ? String(item.mimeType) : null,
                sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : null,
              })),
            },
          },
          include: {
            reviewedBy: { select: { id: true, name: true, email: true } },
            documents: true,
          },
        });
      });

      await handleAuditLog(String(req.user.id), "kyc.submitted", "verification_submission", submission.id, {
        document_type: submission.documentType,
      });

      const currentUser = await prisma.user.findUnique({
        where: { id: String(req.user.id) },
        select: { id: true, name: true, email: true, tenantId: true, role: true },
      });
      const admins = await getActiveAdminUsers();
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.id,
            tenantId: currentUser?.tenantId ?? null,
            createdById: String(req.user.id),
            type: "verification",
            title: "New KYC submission",
            message: `${currentUser?.name || currentUser?.email || "A user"} submitted ${String(currentUser?.role || req.user.role)} verification for review.`,
            actionUrl: `/admin/users?search=${encodeURIComponent(currentUser?.email || currentUser?.name || submission.id)}&user=${encodeURIComponent(currentUser?.id || String(req.user.id))}`,
            metadata: {
              verificationId: submission.id,
              userId: currentUser?.id ?? String(req.user.id),
              userEmail: currentUser?.email ?? null,
              role: currentUser?.role ?? String(req.user.role),
            },
          }),
        ),
      );

      res.json({ success: true, verification: serializeVerificationSubmission(submission) });
    } catch (error: any) {
      console.error(error);
      res.status(400).json({ error: error.message || "Failed to submit verification" });
    }
  });

  app.get("/api/users/privacy/export", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const [user, orders, transactions, addresses, notificationPreference] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, include: { items: true } }),
      prisma.payoutTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      prisma.address.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      ensureNotificationPreference(userId),
    ]);

    res.json({
      exported_at: new Date().toISOString(),
      user: user ? serializeUser(user) : null,
      addresses: addresses.map(serializeAddress),
      orders: orders.map((order) => ({ ...serializeOrder(order), items: order.items.map(serializeOrderItem) })),
      transactions: transactions.map(serializePayoutTransaction),
      notification_preferences: serializeNotificationPreference(notificationPreference),
    });
  });

  app.post("/api/users/privacy/request", authenticateToken, async (req: any, res) => {
    const parsed = privacyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid privacy request" });
    }

    const request = await prisma.accountActionRequest.create({
      data: {
        userId: String(req.user.id),
        type: parsed.data.type,
        reason: parsed.data.reason || null,
      },
    });

    if (parsed.data.type === "deactivate") {
      await prisma.user.update({
        where: { id: String(req.user.id) },
        data: { deactivatedAt: new Date() },
      });
      await revokeAllSessionsForUser(req.user.id);
      await markLoginActivitiesRevoked(String(req.user.id));
    }

    const requester = await prisma.user.findUnique({
      where: { id: String(req.user.id) },
      select: { id: true, name: true, email: true, tenantId: true },
    });
    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          tenantId: requester?.tenantId ?? null,
          createdById: String(req.user.id),
          type: "account_action",
          title: "New account action request",
          message: `${requester?.name || requester?.email || "A user"} submitted a ${String(request.type).replaceAll("_", " ")} request.`,
          actionUrl: `/admin/users?search=${encodeURIComponent(requester?.email || requester?.name || request.id)}&user=${encodeURIComponent(requester?.id || String(req.user.id))}`,
          metadata: {
            requestId: request.id,
            userId: requester?.id ?? String(req.user.id),
            userEmail: requester?.email ?? null,
            type: request.type,
          },
        }),
      ),
    );

    await handleAuditLog(String(req.user.id), "privacy.request_created", "account_action_request", request.id, { type: request.type });
    res.json({ success: true, request: serializeAccountActionRequest(request) });
  });

  app.patch("/api/orders/:id/status", authenticateToken, async (req: any, res) => {
    const { status, courierProvider, trackingId, deliveryFailureReason } = req.body;
    const orderId = req.params.id;
    const userRole = req.user.role;

    if (userRole !== 'admin' && userRole !== 'seller') {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      // If seller, verify the order contains their products
      if (userRole === 'seller') {
        const hasProduct = await prisma.orderItem.findFirst({
          where: {
            orderId,
            product: {
              sellerId: String(req.user.id),
            },
          },
          select: { id: true },
        });
        
        if (!hasProduct) return res.status(403).json({ error: "Unauthorized" });
      }

      const timestampData: Record<string, unknown> = {};

      if (status === 'pickup_requested') timestampData.pickupRequestedAt = new Date();
      if (status === 'picked_up') timestampData.pickedUpAt = new Date();
      if (status === 'out_for_delivery') timestampData.outForDeliveryAt = new Date();
      if (status === 'delivered') timestampData.deliveredAt = new Date();
      if (status !== 'delivery_failed') timestampData.deliveryFailureReason = null;
      if (status === 'delivery_failed' && typeof deliveryFailureReason === 'string' && deliveryFailureReason.trim()) {
        timestampData.deliveryFailureReason = deliveryFailureReason.trim();
      }

      const updatedOrder: any = await prisma.order.update({
        where: { id: orderId },
        data: {
          status,
          courierProvider: typeof courierProvider === 'string' && courierProvider.trim() ? courierProvider.trim() : undefined,
          trackingId: typeof trackingId === 'string' && trackingId.trim() ? trackingId.trim() : undefined,
          ...timestampData,
        } as any,
      });

      const customerMessageByStatus: Record<string, string> = {
        packed: `Order ${updatedOrder.id} has been packed and is being prepared for courier handover.`,
        ready_for_pickup: `Order ${updatedOrder.id} is ready for courier pickup.`,
        pickup_requested: `Courier pickup has been requested for order ${updatedOrder.id}.`,
        picked_up: `Order ${updatedOrder.id} has been picked up by the courier.`,
        in_transit: `Order ${updatedOrder.id} is now in transit.`,
        out_for_delivery: `Order ${updatedOrder.id} is out for delivery.`,
        delivered: `Order ${updatedOrder.id} has been delivered successfully.`,
        delivery_failed: `Delivery attempt failed for order ${updatedOrder.id}. Our team will follow up shortly.`,
      };

      if (customerMessageByStatus[status]) {
        await createNotification({
          userId: updatedOrder.userId,
          tenantId: updatedOrder.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment update',
          message: customerMessageByStatus[status],
          actionUrl: `/track?order=${updatedOrder.id}`,
          metadata: {
            orderId: updatedOrder.id,
            status: updatedOrder.status,
            courierProvider: updatedOrder.courierProvider,
            trackingId: updatedOrder.trackingId,
          },
        });
      }

      if (status === 'delivered') {
        await settleResellerCommissionsForOrder(updatedOrder.id);
      } else if (status === 'cancelled' || status === 'returned' || status === 'delivery_failed') {
        await reverseResellerCommissionsForOrder(updatedOrder.id, status);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  app.patch("/api/shipments/:id/status", authenticateToken, async (req: any, res) => {
    const { status, courierProvider, trackingId, deliveryFailureReason } = req.body;
    const shipmentId = req.params.id;
    const userRole = req.user.role;

    if (userRole !== 'admin' && userRole !== 'seller') {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const shipment = await prisma.orderShipment.findFirst({
        where: userRole === 'seller'
          ? {
              id: shipmentId,
              sellerId: String(req.user.id),
            }
          : {
              id: shipmentId,
            },
        select: {
          id: true,
          orderId: true,
          sellerId: true,
          status: true,
          order: {
            select: {
              userId: true,
              tenantId: true,
            },
          },
        },
      });

      if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
      }

      const timestampData: Record<string, unknown> = {};
      if (status === 'pickup_requested') timestampData.pickupRequestedAt = new Date();
      if (status === 'picked_up') timestampData.pickedUpAt = new Date();
      if (status === 'out_for_delivery') timestampData.outForDeliveryAt = new Date();
      if (status === 'delivered') timestampData.deliveredAt = new Date();
      if (status !== 'delivery_failed') timestampData.deliveryFailureReason = null;
      if (status === 'delivery_failed' && typeof deliveryFailureReason === 'string' && deliveryFailureReason.trim()) {
        timestampData.deliveryFailureReason = deliveryFailureReason.trim();
      }

      const updatedShipment: any = await prisma.orderShipment.update({
        where: { id: shipmentId },
        data: {
          status,
          courierProvider: typeof courierProvider === 'string' && courierProvider.trim() ? courierProvider.trim() : undefined,
          trackingId: typeof trackingId === 'string' && trackingId.trim() ? trackingId.trim() : undefined,
          ...timestampData,
        } as any,
        include: {
          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
        },
      });

      const customerMessageByStatus: Record<string, string> = {
        packed: `One shipment from your order ${shipment.orderId} has been packed.`,
        ready_for_pickup: `One shipment from your order ${shipment.orderId} is ready for courier pickup.`,
        pickup_requested: `Courier pickup has been requested for one shipment from your order ${shipment.orderId}.`,
        picked_up: `A shipment from your order ${shipment.orderId} has been picked up by the courier.`,
        in_transit: `A shipment from your order ${shipment.orderId} is now in transit.`,
        out_for_delivery: `A shipment from your order ${shipment.orderId} is out for delivery.`,
        delivered: `A shipment from your order ${shipment.orderId} has been delivered successfully.`,
        delivery_failed: `A shipment from your order ${shipment.orderId} could not be delivered on this attempt.`,
      };

      if (customerMessageByStatus[status]) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment update',
          message: customerMessageByStatus[status],
          actionUrl: `/account/orders/${shipment.orderId}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.orderId,
            shipmentId: shipment.id,
            status: updatedShipment.status,
            courierProvider: updatedShipment.courierProvider,
            trackingId: updatedShipment.trackingId,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.orderId, status);

      res.json({ success: true, shipment: serializeOrderShipment(updatedShipment) });
    } catch (error) {
      res.status(500).json({ error: "Failed to update shipment status" });
    }
  });

  app.get("/api/orders/track/:id", async (req, res) => {
    const trackingKey = String(req.params.id || "").trim();
    const order: any = await prisma.order.findFirst({
      where: {
        OR: [
          { id: trackingKey },
          { orderCode: trackingKey.toUpperCase() },
        ],
      },
      select: {
        id: true,
        orderCode: true,
        status: true,
        createdAt: true,
        courierProvider: true,
        trackingId: true,
        pickupRequestedAt: true,
        pickedUpAt: true,
        outForDeliveryAt: true,
        deliveredAt: true,
        deliveryFailureReason: true,
        shipments: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      } as any,
    });
    if (!order) return res.status(404).json({ error: "Order not found" });

    const shipmentStages = [
      { label: 'Order placed', statuses: ['pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'] },
      { label: 'Processing', statuses: ['processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Packed', statuses: ['packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Ready for pickup', statuses: ['ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Pickup requested', statuses: ['pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Picked up', statuses: ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'In transit', statuses: ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'] },
      { label: 'Out for delivery', statuses: ['out_for_delivery', 'delivered', 'delivery_failed'] },
      { label: 'Delivered', statuses: ['delivered'] },
    ];

    const stepDates: Record<string, string> = {
      'Order placed': new Date(order.createdAt).toLocaleString(),
      'Processing': order.status !== 'pending' ? 'Updated' : '-',
      'Packed': ['packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
      'Ready for pickup': ['ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
      'Pickup requested': order.pickupRequestedAt ? new Date(order.pickupRequestedAt).toLocaleString() : '-',
      'Picked up': order.pickedUpAt ? new Date(order.pickedUpAt).toLocaleString() : '-',
      'In transit': ['in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned'].includes(order.status) ? 'Updated' : '-',
      'Out for delivery': order.outForDeliveryAt ? new Date(order.outForDeliveryAt).toLocaleString() : '-',
      'Delivered': order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : '-',
    };

    const steps = shipmentStages.map((stage) => ({
      label: stage.label,
      date: stepDates[stage.label] ?? '-',
      completed: stage.statuses.includes(order.status),
    }));

    res.json({
      id: order.id,
      order_code: order.orderCode ?? null,
      status: order.status,
      created_at: order.createdAt.toISOString(),
      courier_provider: order.courierProvider ?? null,
      tracking_id: order.trackingId ?? null,
      delivery_failure_reason: order.deliveryFailureReason ?? null,
      shipments: Array.isArray(order.shipments) ? order.shipments.map(serializeOrderShipment) : [],
      steps,
    });
  });

  app.get("/api/logistics/providers", async (req: any, res) => {
    const providers = logisticsModule.listProviders();
    const includeDisabled = String(req.query?.includeDisabled || '').toLowerCase() === 'true';

    if (includeDisabled) {
      const commerceChannels = await getCommerceChannelSettings();
      return res.json(
        providers.map((provider) => ({
          ...provider,
          enabled: commerceChannels.courierProviders.includes(provider.code as any),
        })),
      );
    }

    const commerceChannels = await getCommerceChannelSettings();
    res.json(
      providers.filter((provider) => commerceChannels.courierProviders.includes(provider.code as any)),
    );
  });

  app.get("/api/logistics/pathao/cities", authenticateToken, requireRole("admin", "seller"), async (_req: any, res) => {
    try {
      const payload = await getOrSetCache(
        "pathao:cities",
        async () => listPathaoCities(),
        60 * 60 * 6,
      );
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao cities' });
    }
  });

  app.get("/api/logistics/pathao/cities/:cityId/zones", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const cityId = Number(req.params.cityId);
    if (!Number.isFinite(cityId) || cityId <= 0) {
      return res.status(400).json({ error: 'Valid cityId is required' });
    }

    try {
      const payload = await getOrSetCache(
        `pathao:zones:${cityId}`,
        async () => listPathaoZones(cityId),
        60 * 60 * 6,
      );
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao zones' });
    }
  });

  app.get("/api/logistics/pathao/zones/:zoneId/areas", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const zoneId = Number(req.params.zoneId);
    if (!Number.isFinite(zoneId) || zoneId <= 0) {
      return res.status(400).json({ error: 'Valid zoneId is required' });
    }

    try {
      const payload = await getOrSetCache(
        `pathao:areas:${zoneId}`,
        async () => listPathaoAreas(zoneId),
        60 * 60 * 6,
      );
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao areas' });
    }
  });

  app.get("/api/logistics/pathao/stores", authenticateToken, requireRole("admin", "seller"), async (_req: any, res) => {
    try {
      const payload = await listPathaoStores();
      res.json(payload);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao stores' });
    }
  });

  app.get("/api/logistics/pathao/stores/:storeId", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return res.status(400).json({ error: 'Valid storeId is required' });
    }

    try {
      const store = await getPathaoStoreInfo(storeId);
      if (!store) {
        return res.status(404).json({ error: 'Pathao store not found' });
      }
      res.json({ success: true, store });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao store info' });
    }
  });

  app.get("/api/logistics/pathao/token", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const diagnostics = await getPathaoTokenDiagnostics();
      res.json({ success: true, diagnostics });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao token diagnostics' });
    }
  });

  app.post("/api/logistics/pathao/token/issue", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const grantType = req.body?.grant_type === 'refresh_token' ? 'refresh_token' : 'password';
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token.trim() : null;

    try {
      const tokenBundle =
        grantType === 'refresh_token'
          ? await issuePathaoAccessToken({ mode: 'refresh_token', refreshToken, force: true })
          : await issuePathaoAccessToken({ mode: 'password', force: true });

      res.json({
        success: true,
        token_type: tokenBundle.tokenType,
        access_token: tokenBundle.accessToken,
        refresh_token: tokenBundle.refreshToken ?? null,
        expires_in: tokenBundle.expiresIn,
        issued_at: new Date(tokenBundle.issuedAt).toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to issue Pathao access token' });
    }
  });

  app.post("/api/logistics/pathao/token/refresh", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const tokenBundle = await refreshPathaoAccessToken();
      res.json({
        success: true,
        token_type: tokenBundle.tokenType,
        access_token: tokenBundle.accessToken,
        refresh_token: tokenBundle.refreshToken ?? null,
        expires_in: tokenBundle.expiresIn,
        issued_at: new Date(tokenBundle.issuedAt).toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to refresh Pathao access token' });
    }
  });

  app.post("/api/logistics/pathao/stores", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const warehouseId = typeof req.body?.warehouseId === 'string' ? req.body.warehouseId.trim() : '';

    try {
      if (warehouseId) {
        const warehouse = await prisma.warehouse.findUnique({
          where: { id: warehouseId },
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            contactName: true,
            secondaryContact: true,
            otpNumber: true,
            pathaoCityId: true,
            pathaoZoneId: true,
            pathaoAreaId: true,
          },
        });

        if (!warehouse) {
          return res.status(404).json({ error: 'Warehouse not found' });
        }

        if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) {
          return res.status(400).json({ error: 'Warehouse is missing Pathao city, zone, or area mapping' });
        }

        const payload = {
          name: warehouse.name,
          contact_name: warehouse.contactName || warehouse.name,
          contact_number: String(warehouse.phone || '').trim(),
          secondary_contact: warehouse.secondaryContact || undefined,
          otp_number: warehouse.otpNumber || undefined,
          address: warehouse.address,
          city_id: warehouse.pathaoCityId,
          zone_id: warehouse.pathaoZoneId,
          area_id: warehouse.pathaoAreaId,
        };

        const created = await createPathaoStore(payload);
        const stores = await listPathaoStores();
        const items = Array.isArray((stores as any)?.data?.data) ? (stores as any).data.data : [];
        const matched = [...items].reverse().find((item: any) => String(item?.store_name || '').trim().toLowerCase() === warehouse.name.trim().toLowerCase());
        const storeId = Number(matched?.store_id || 0);

        if (storeId) {
          await prisma.warehouse.update({
            where: { id: warehouse.id },
            data: { pathaoStoreId: storeId },
          });
        }

        return res.json({ success: true, store: created, store_id: storeId || null });
      }

      const created = await createPathaoStore(req.body || {});
      res.json({ success: true, store: created });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to create Pathao store' });
    }
  });

  app.post("/api/logistics/pathao/orders", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const payload = req.body || {};
    const storeId = Number(payload.store_id);
    const itemQuantity = Number(payload.item_quantity);
    const amountToCollect = Number(payload.amount_to_collect);
    const deliveryType = Number(payload.delivery_type);
    const itemType = Number(payload.item_type);

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return res.status(400).json({ error: 'store_id is required' });
    }
    if (typeof payload.recipient_name !== 'string' || payload.recipient_name.trim().length < 3) {
      return res.status(400).json({ error: 'recipient_name is required' });
    }
    if (typeof payload.recipient_phone !== 'string' || payload.recipient_phone.trim().length < 11) {
      return res.status(400).json({ error: 'recipient_phone is required' });
    }
    if (typeof payload.recipient_address !== 'string' || payload.recipient_address.trim().length < 10) {
      return res.status(400).json({ error: 'recipient_address is required' });
    }
    if (!Number.isFinite(itemQuantity) || itemQuantity <= 0) {
      return res.status(400).json({ error: 'item_quantity must be greater than 0' });
    }
    if (!Number.isFinite(amountToCollect) || amountToCollect < 0) {
      return res.status(400).json({ error: 'amount_to_collect must be 0 or greater' });
    }
    if (![12, 48].includes(deliveryType)) {
      return res.status(400).json({ error: 'delivery_type must be 12 or 48' });
    }
    if (![1, 2].includes(itemType)) {
      return res.status(400).json({ error: 'item_type must be 1 or 2' });
    }

    try {
      const response = await createPathaoOrder({
        store_id: storeId,
        merchant_order_id: typeof payload.merchant_order_id === 'string' ? payload.merchant_order_id : undefined,
        recipient_name: payload.recipient_name,
        recipient_phone: payload.recipient_phone,
        recipient_secondary_phone: typeof payload.recipient_secondary_phone === 'string' ? payload.recipient_secondary_phone : undefined,
        recipient_address: payload.recipient_address,
        recipient_city: Number.isFinite(Number(payload.recipient_city)) && Number(payload.recipient_city) > 0 ? Number(payload.recipient_city) : undefined,
        recipient_zone: Number.isFinite(Number(payload.recipient_zone)) && Number(payload.recipient_zone) > 0 ? Number(payload.recipient_zone) : undefined,
        recipient_area: Number.isFinite(Number(payload.recipient_area)) && Number(payload.recipient_area) > 0 ? Number(payload.recipient_area) : undefined,
        delivery_type: deliveryType as 12 | 48,
        item_type: itemType as 1 | 2,
        special_instruction: typeof payload.special_instruction === 'string' ? payload.special_instruction : undefined,
        item_quantity: itemQuantity,
        item_weight: payload.item_weight ?? 0.5,
        item_description: typeof payload.item_description === 'string' ? payload.item_description : undefined,
        amount_to_collect: amountToCollect,
      });
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to create Pathao order' });
    }
  });

  app.post("/api/logistics/pathao/price", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const payload = {
      store_id: Number(req.body?.store_id),
      item_type: Number(req.body?.item_type || 2) as 1 | 2,
      delivery_type: Number(req.body?.delivery_type || 48) as 12 | 48,
      item_weight: Number(req.body?.item_weight || 0.5),
      recipient_city: Number(req.body?.recipient_city),
      recipient_zone: Number(req.body?.recipient_zone),
    };

    if (!Number.isFinite(payload.store_id) || !Number.isFinite(payload.recipient_city) || !Number.isFinite(payload.recipient_zone)) {
      return res.status(400).json({ error: 'store_id, recipient_city, and recipient_zone are required' });
    }

    try {
      const response = await calculatePathaoPrice(payload);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to calculate Pathao delivery price' });
    }
  });

  app.post("/api/logistics/pathao/orders/bulk", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    if (orders.length === 0) {
      return res.status(400).json({ error: 'At least one order payload is required' });
    }

    try {
      const response = await createPathaoBulkOrders(orders);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to create Pathao bulk orders' });
    }
  });

  app.post("/api/logistics/pathao/shipments/:shipmentId/sync", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const shipmentId = String(req.params.shipmentId || '').trim();
    if (!shipmentId) {
      return res.status(400).json({ error: 'shipmentId is required' });
    }

    try {
      const shipment = await prisma.orderShipment.findFirst({
        where:
          req.user.role === 'admin'
            ? { id: shipmentId }
            : {
                id: shipmentId,
                sellerId: String(req.user.id),
              },
        include: {
          order: {
            select: {
              id: true,
              userId: true,
              tenantId: true,
            },
          },
        },
      });

      if (!shipment) {
        return res.status(404).json({ error: 'Shipment not found' });
      }

      if (!shipment.trackingId) {
        return res.status(400).json({ error: 'Shipment has no Pathao tracking ID yet' });
      }

      const pathaoPayload = await getPathaoOrderInfo(shipment.trackingId);
      const pathaoData = (pathaoPayload as any)?.data ?? {};
      const rawStatus = pathaoData?.order_status_slug ?? pathaoData?.order_status ?? pathaoData?.status ?? null;
      const normalizedStatus = normalizePathaoShipmentStatus(pathaoData?.event ?? null, rawStatus) || shipment.status;

      const mergedMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const timestampData = buildShipmentTimestampData(normalizedStatus, shipment);

      const updatedShipment = await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status: normalizedStatus,
          ...timestampData,
          shipmentMetadata: {
            ...mergedMetadata,
            pathaoLastSyncAt: new Date().toISOString(),
            pathaoLastEvent: pathaoData?.event ?? null,
            pathaoLastStatusSlug: pathaoData?.order_status_slug ?? pathaoData?.order_status ?? pathaoData?.status ?? null,
            pathaoLastOrderInfo: pathaoPayload,
          },
        } as any,
      });

      if (normalizedStatus !== shipment.status) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment status refreshed',
          message: `Shipment ${shipment.id.slice(0, 8)} is now ${normalizedStatus.replaceAll('_', ' ')} after Pathao sync.`,
          actionUrl: `/account/orders/${shipment.order.id}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.order.id,
            shipmentId: shipment.id,
            status: normalizedStatus,
            courierProvider: shipment.courierProvider,
            trackingId: shipment.trackingId,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.order.id, normalizedStatus);

      res.json({
        success: true,
        shipment: serializeOrderShipment(updatedShipment),
        providerPayload: pathaoPayload,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to sync Pathao shipment status' });
    }
  });

  app.get("/api/logistics/pathao/orders/:consignmentId/info", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const consignmentId = String(req.params.consignmentId || '').trim();
    if (!consignmentId) {
      return res.status(400).json({ error: 'consignmentId is required' });
    }

    try {
      const response = await getPathaoOrderInfo(consignmentId);
      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to load Pathao order info' });
    }
  });

  app.post("/api/logistics/redx/shipments/:shipmentId/sync", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const shipment = await prisma.orderShipment.findUnique({
      where: { id: req.params.shipmentId },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            tenantId: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (req.user.role === 'seller') {
      const sellerWarehouse = shipment.warehouseId
        ? await prisma.warehouse.findFirst({
            where: {
              id: shipment.warehouseId,
              managerId: String(req.user.id),
            },
            select: { id: true },
          })
        : null;

      if (!sellerWarehouse) {
        return res.status(403).json({ error: 'You do not have access to this shipment' });
      }
    }

    if (!shipment.trackingId) {
      return res.status(400).json({ error: 'This shipment does not have a RedX tracking ID yet.' });
    }

    try {
      const redxInfo = await getRedxOrderInfo(shipment.trackingId);
      const normalizedStatus = normalizeCourierStatus(redxInfo.rawStatus) || shipment.status;
      const mergedMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const timestampData: Record<string, unknown> = {};
      if (normalizedStatus === 'picked_up') timestampData.pickedUpAt = shipment.pickedUpAt ?? new Date();
      if (normalizedStatus === 'out_for_delivery') timestampData.outForDeliveryAt = shipment.outForDeliveryAt ?? new Date();
      if (normalizedStatus === 'delivered') timestampData.deliveredAt = shipment.deliveredAt ?? new Date();

      const updatedShipment = await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status: normalizedStatus,
          trackingId: redxInfo.trackingId || shipment.trackingId,
          ...timestampData,
          shipmentMetadata: {
            ...mergedMetadata,
            redxLastSyncAt: new Date().toISOString(),
            redxLastOrderInfo: redxInfo.payload,
          },
        } as any,
      });

      if (normalizedStatus !== shipment.status) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment status refreshed',
          message: `Shipment ${shipment.id.slice(0, 8)} is now ${normalizedStatus.replaceAll('_', ' ')} after RedX sync.`,
          actionUrl: `/account/orders/${shipment.order.id}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.order.id,
            shipmentId: shipment.id,
            status: normalizedStatus,
            courierProvider: shipment.courierProvider,
            trackingId: updatedShipment.trackingId,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.order.id, normalizedStatus);

      res.json({
        success: true,
        shipment: serializeOrderShipment(updatedShipment),
        providerPayload: redxInfo.payload,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to sync RedX shipment status' });
    }
  });

  app.post("/api/logistics/steadfast/shipments/:shipmentId/sync", authenticateToken, requireRole("admin", "seller"), async (req: any, res) => {
    const shipmentId = String(req.params.shipmentId || "");
    const shipment = await prisma.orderShipment.findFirst({
      where: {
        id: shipmentId,
        ...(req.user.role === 'seller' ? { sellerId: String(req.user.id) } : {}),
      },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            tenantId: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (!shipment.trackingId) {
      return res.status(400).json({ error: 'This shipment does not have a Steadfast tracking code yet.' });
    }

    try {
      const steadfastInfo = await getSteadfastOrderInfo(shipment.trackingId);
      const normalizedStatus = normalizeCourierStatus(steadfastInfo.rawStatus) || shipment.status;
      const mergedMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const timestampData: Record<string, unknown> = {};
      if (normalizedStatus === 'picked_up') timestampData.pickedUpAt = shipment.pickedUpAt ?? new Date();
      if (normalizedStatus === 'out_for_delivery') timestampData.outForDeliveryAt = shipment.outForDeliveryAt ?? new Date();
      if (normalizedStatus === 'delivered') timestampData.deliveredAt = shipment.deliveredAt ?? new Date();

      const updatedShipment = await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          status: normalizedStatus,
          trackingId: steadfastInfo.trackingId || shipment.trackingId,
          ...timestampData,
          shipmentMetadata: {
            ...mergedMetadata,
            steadfastLastSyncAt: new Date().toISOString(),
            steadfastLastOrderInfo: steadfastInfo.payload,
            consignmentId: steadfastInfo.consignmentId || mergedMetadata.consignmentId || null,
          },
        } as any,
      });

      if (normalizedStatus !== shipment.status) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment status refreshed',
          message: `Shipment ${shipment.id.slice(0, 8)} is now ${normalizedStatus.replaceAll('_', ' ')} after Steadfast sync.`,
          actionUrl: `/account/orders/${shipment.order.id}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.order.id,
            shipmentId: shipment.id,
            status: normalizedStatus,
            courierProvider: shipment.courierProvider,
            trackingId: updatedShipment.trackingId,
          },
        });
      }

      await syncResellerSettlementFromShipmentStatus(shipment.order.id, normalizedStatus);

      res.json({
        success: true,
        shipment: serializeOrderShipment(updatedShipment),
        providerPayload: steadfastInfo.payload,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to sync Steadfast shipment status' });
    }
  });

  app.get("/api/logistics/steadfast/balance", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastBalance();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast balance' });
    }
  });

  app.post("/api/logistics/steadfast/orders/bulk", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];

    if (orders.length === 0) {
      return res.status(400).json({ error: 'orders array is required' });
    }

    try {
      const payload = await createSteadfastBulkOrders(orders);
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to create Steadfast bulk orders' });
    }
  });

  app.post("/api/logistics/steadfast/returns", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const identifier =
      typeof req.body?.consignment_id === 'string'
        ? req.body.consignment_id
        : typeof req.body?.invoice === 'string'
          ? req.body.invoice
          : typeof req.body?.tracking_code === 'string'
            ? req.body.tracking_code
            : '';

    if (!identifier) {
      return res.status(400).json({ error: 'consignment_id or invoice or tracking_code is required' });
    }

    try {
      const payload = await createSteadfastReturnRequest({
        consignment_id: typeof req.body?.consignment_id === 'string' ? req.body.consignment_id : undefined,
        invoice: typeof req.body?.invoice === 'string' ? req.body.invoice : undefined,
        tracking_code: typeof req.body?.tracking_code === 'string' ? req.body.tracking_code : undefined,
        reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      });
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to create Steadfast return request' });
    }
  });

  app.get("/api/logistics/steadfast/returns", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastReturnRequests();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast return requests' });
    }
  });

  app.get("/api/logistics/steadfast/returns/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const payload = await getSteadfastReturnRequest(String(req.params.id || ''));
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast return request' });
    }
  });

  app.get("/api/logistics/steadfast/payments", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastPayments();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast payments' });
    }
  });

  app.get("/api/logistics/steadfast/payments/:paymentId", authenticateToken, requireRole("admin"), async (req: any, res) => {
    try {
      const payload = await getSteadfastPayment(String(req.params.paymentId || ''));
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast payment details' });
    }
  });

  app.get("/api/logistics/steadfast/police-stations", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const payload = await getSteadfastPoliceStations();
      res.json(payload);
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to fetch Steadfast police stations' });
    }
  });

  app.post("/api/logistics/webhooks/:provider", async (req, res) => {
    const provider = String(req.params.provider || '').toLowerCase();
    if (provider === 'pathao' && String(req.body?.event || '') === 'webhook_integration') {
      res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', getPathaoWebhookIntegrationSecret());
      return res.status(202).json({ accepted: true });
    }

    const expectedToken =
      provider === 'pathao'
        ? env.PATHAO_WEBHOOK_TOKEN
        : provider === 'redx'
          ? env.REDX_WEBHOOK_TOKEN
          : provider === 'steadfast'
            ? (env.STEADFAST_WEBHOOK_TOKEN || env.STEADFAST_API_KEY)
          : undefined;

    const authorizationHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    const bearerToken = authorizationHeader.toLowerCase().startsWith('bearer ')
      ? authorizationHeader.slice(7).trim()
      : '';
    const providedToken =
      (typeof req.query?.token === 'string' && req.query.token) ||
      (typeof req.headers['x-courier-webhook-token'] === 'string' && req.headers['x-courier-webhook-token']) ||
      (provider === 'pathao' && typeof req.headers['x-pathao-signature'] === 'string' ? req.headers['x-pathao-signature'] : '') ||
      (provider === 'steadfast' ? bearerToken : '') ||
      '';

    if (expectedToken && providedToken !== expectedToken) {
      return res.status(401).json({ error: 'Invalid courier webhook token' });
    }

    try {
      const details = extractCourierWebhookDetails(req.body);

      if (!details.trackingId && !(provider === 'steadfast' && (details.consignmentId || details.invoice))) {
        return res.status(202).json({ accepted: true, reason: 'tracking_id_missing' });
      }

      let shipment = await prisma.orderShipment.findFirst({
        where: { trackingId: details.trackingId || undefined },
        select: {
          id: true,
          orderId: true,
          status: true,
          trackingId: true,
          shipmentMetadata: true,
          courierProvider: true,
          warehouseId: true,
          pickupRequestedAt: true,
          pickedUpAt: true,
          outForDeliveryAt: true,
          deliveredAt: true,
          deliveryFailureReason: true,
          updatedAt: true,
          order: {
            select: {
              userId: true,
              tenantId: true,
            },
          },
        },
      });

      if (!shipment && provider === 'steadfast') {
        const candidateShipments = await prisma.orderShipment.findMany({
          where: {
            courierProvider: {
              contains: 'steadfast',
              mode: 'insensitive',
            },
          },
          select: {
            id: true,
            orderId: true,
            status: true,
            trackingId: true,
            shipmentMetadata: true,
            courierProvider: true,
            warehouseId: true,
            pickupRequestedAt: true,
            pickedUpAt: true,
            outForDeliveryAt: true,
            deliveredAt: true,
            deliveryFailureReason: true,
            updatedAt: true,
            order: {
              select: {
                userId: true,
                tenantId: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        });

        shipment =
          candidateShipments.find((entry) => {
            const metadata =
              entry.shipmentMetadata && typeof entry.shipmentMetadata === 'object'
                ? (entry.shipmentMetadata as Record<string, unknown>)
                : {};
            const consignmentId =
              typeof metadata.consignmentId === 'string'
                ? metadata.consignmentId
                : typeof metadata.consignmentId === 'number'
                  ? String(metadata.consignmentId)
                  : null;
            const invoice = typeof metadata.invoice === 'string' ? metadata.invoice : null;

            return (
              (details.consignmentId && consignmentId === details.consignmentId) ||
              (details.invoice && invoice === details.invoice)
            );
          }) || null;
      }

      if (!shipment) {
        return res.status(202).json({ accepted: true, reason: 'shipment_not_found' });
      }

      const shipmentMetadata =
        shipment.shipmentMetadata && typeof shipment.shipmentMetadata === 'object'
          ? { ...(shipment.shipmentMetadata as Record<string, unknown>) }
          : {};

      const nextStatus =
        provider === 'pathao'
          ? details.pathaoNormalizedStatus || details.normalizedStatus
          : details.normalizedStatus;
      const timestampData = buildShipmentTimestampData(nextStatus, shipment);

      await prisma.orderShipment.update({
        where: { id: shipment.id },
        data: {
          ...(nextStatus ? { status: nextStatus } : {}),
          ...timestampData,
          shipmentMetadata: {
            ...shipmentMetadata,
            lastWebhookSyncAt: new Date().toISOString(),
            lastWebhookProvider: provider,
            lastWebhookStatus: details.rawStatus,
            lastWebhookPayload: req.body,
            ...(provider === 'pathao'
              ? {
                  pathaoLastSyncAt: new Date().toISOString(),
                  pathaoLastEvent: details.pathaoEvent || null,
                  pathaoLastStatusSlug: details.pathaoOrderStatus || null,
                }
              : {}),
            ...(provider === 'steadfast'
              ? {
                  steadfastLastSyncAt: new Date().toISOString(),
                  consignmentId: details.consignmentId || shipmentMetadata.consignmentId || null,
                  invoice: details.invoice || shipmentMetadata.invoice || null,
                }
              : {}),
          },
        } as any,
      });

      if (nextStatus) {
        await createNotification({
          userId: shipment.order.userId,
          tenantId: shipment.order.tenantId ?? null,
          type: 'order_update',
          title: 'Shipment tracking updated',
          message: `Shipment ${shipment.id.slice(0, 8)} from order ${shipment.orderId} is now ${nextStatus.replaceAll('_', ' ')}.`,
          actionUrl: `/account/orders/${shipment.orderId}?shipment=${shipment.id}`,
          metadata: {
            orderId: shipment.orderId,
            shipmentId: shipment.id,
            status: nextStatus,
            courierProvider: provider,
            trackingId: details.trackingId,
          },
        });
        await syncResellerSettlementFromShipmentStatus(shipment.orderId, nextStatus);
      }

      if (provider === 'pathao') {
        res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', getPathaoWebhookIntegrationSecret());
        return res.status(202).json({ accepted: true, shipmentId: shipment.id, orderId: shipment.orderId, status: nextStatus });
      }

      res.json({ success: true, shipmentId: shipment.id, orderId: shipment.orderId, status: nextStatus });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Failed to process courier webhook' });
    }
  });

  // Wishlist Routes
  app.get("/api/wishlist", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const items = await prisma.wishlistItem.findMany({
      where: { userId },
      include: {
        product: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(items.map((item) => serializeProduct(item.product)));
  });

  app.post("/api/wishlist", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const { productId } = req.body;
    try {
      await prisma.wishlistItem.upsert({
        where: {
          userId_productId: {
            userId,
            productId,
          },
        },
        update: {},
        create: {
          userId,
          productId,
        },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to add to wishlist" });
    }
  });

  app.delete("/api/wishlist/:productId", authenticateToken, async (req: any, res) => {
    const userId = String(req.user.id);
    const { productId } = req.params;
    try {
      await prisma.wishlistItem.deleteMany({
        where: {
          userId,
          productId,
        },
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove from wishlist" });
    }
  });

  app.get("/api/flash-sale/active", async (_req, res) => {
    const now = new Date();

    const payload = await getOrSetCache(
      "flash-sale:active",
      async () => {
        const campaign =
          (await prisma.flashSaleCampaign.findFirst({
            where: {
              status: { in: ["live", "published"] },
              startsAt: { lte: now },
              endsAt: { gte: now },
            },
            orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
            include: {
              createdBy: { select: { name: true } },
              entries: {
                where: { status: "approved" },
                include: {
                  seller: { select: { name: true } },
                  reviewedBy: { select: { name: true } },
                  product: {
                    include: {
                      seller: { select: { name: true } },
                    },
                  },
                },
                orderBy: { createdAt: "desc" },
              },
            },
          })) ||
          (await prisma.flashSaleCampaign.findFirst({
            where: {
              status: { in: ["scheduled", "published", "live"] },
              startsAt: { gt: now },
            },
            orderBy: { startsAt: "asc" },
            include: {
              createdBy: { select: { name: true } },
              entries: {
                where: { status: "approved" },
                include: {
                  seller: { select: { name: true } },
                  reviewedBy: { select: { name: true } },
                  product: {
                    include: {
                      seller: { select: { name: true } },
                    },
                  },
                },
                orderBy: { createdAt: "desc" },
              },
            },
          }));

        return campaign ? serializeFlashSaleCampaign(campaign) : null;
      },
      120,
    );

    res.json({ campaign: payload });
  });

  app.post("/api/coupons/validate", async (req, res) => {
    const { code, orderValue, sellerId, productIds } = req.body;
    try {
      const coupon = await validateCouponForCart({
        code,
        orderValue: Number(orderValue || 0),
        sellerId: sellerId ? String(sellerId) : null,
        productIds: Array.isArray(productIds) ? productIds.map((id) => String(id)) : [],
      });

      if (!coupon) {
        return res.status(404).json({ error: "Invalid coupon code" });
      }

      res.json(coupon);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to validate coupon";
      const statusCode = message === "Invalid coupon code" ? 404 : 400;
      return res.status(statusCode).json({ error: message });
    }
  });

  // Admin Routes
  app.get("/api/admin/users", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        verificationSubmission: true,
        riskFlags: {
          where: { isActive: true },
        },
      },
    });
    res.json(
      users.map((user) => ({
        ...serializeUser(user),
        verification_status: user.verificationSubmission?.status ?? null,
        risk_flag_count: user.riskFlags.length,
      })),
    );
  });

  app.get("/api/admin/stats", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const [totalUsers, totalSellers, totalOrders, revenueAgg, recentOrders] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'seller' } }),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          user: {
            select: { name: true },
          },
        },
      }),
    ]);

    res.json({
      totalUsers,
      totalSellers,
      totalOrders,
      totalRevenue: toPlainNumber(revenueAgg._sum.total ?? 0),
      recentOrders: recentOrders.map(serializeOrder),
    });
  });

  app.get("/api/admin/dashboard-insights", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [recentOrders, lowStockProducts, activeShipments, riskFlags, sellers, resellers, payoutMethodCounts, warehouses, referrals, resellerMarkups] = await Promise.all([
        prisma.order.findMany({
          where: {
            createdAt: { gte: since },
          status: { not: 'cancelled' },
        },
        select: {
          createdAt: true,
          total: true,
        },
      }),
      prisma.product.findMany({
        where: {
          stock: { lte: env.LOW_STOCK_THRESHOLD },
        },
        orderBy: { stock: 'asc' },
        take: 5,
        select: {
          id: true,
          name: true,
          stock: true,
        },
      }),
      prisma.orderShipment.count({
        where: {
          status: { in: ['processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery'] },
        },
      }),
        prisma.userRiskFlag.count({
          where: { isActive: true },
        }),
        prisma.user.findMany({
          where: { role: 'seller' },
          select: {
            id: true,
            emailVerified: true,
            phoneVerified: true,
            storeName: true,
            storefrontSlug: true,
          },
        }),
        prisma.user.findMany({
          where: { role: 'reseller' },
          select: {
            id: true,
            emailVerified: true,
            phoneVerified: true,
            phone: true,
            bio: true,
          },
        }),
        prisma.payoutMethod.groupBy({
          by: ['userId'],
          where: { status: 'active' },
          _count: { _all: true },
        }),
        prisma.warehouse.findMany({
          select: {
            id: true,
            managerId: true,
            address: true,
            city: true,
            phone: true,
            contactName: true,
            pathaoStoreId: true,
          },
        }),
        prisma.resellerReferral.findMany({
          select: {
            resellerId: true,
            clicks: true,
          },
        }),
        prisma.resellerMarkup.groupBy({
          by: ['resellerId'],
          _count: { _all: true },
        }),
      ]);

      const payoutReadyUserIds = new Set(payoutMethodCounts.map((row) => String(row.userId)));
      const sellerWarehouses = new Map<string, Array<{
        address: string;
        city: string;
        phone: string | null;
        contactName: string | null;
        pathaoStoreId: number | null;
      }>>();

      for (const warehouse of warehouses) {
        if (!warehouse.managerId) continue;
        const key = String(warehouse.managerId);
        const current = sellerWarehouses.get(key) || [];
        current.push({
          address: warehouse.address,
          city: warehouse.city,
          phone: warehouse.phone,
          contactName: warehouse.contactName,
          pathaoStoreId: warehouse.pathaoStoreId,
        });
        sellerWarehouses.set(key, current);
      }

      const resellerReferralMap = new Map(referrals.map((row) => [String(row.resellerId), row]));
      const resellerMarkupMap = new Map(resellerMarkups.map((row) => [String(row.resellerId), Number(row._count?._all || 0)]));

      const sellerIdentityIncomplete = sellers.filter(
        (seller) => !seller.storeName?.trim() || !seller.storefrontSlug?.trim(),
      ).length;
      const sellerVerificationIncomplete = sellers.filter(
        (seller) => !seller.emailVerified || !seller.phoneVerified,
      ).length;
      const sellerPickupIncomplete = sellers.filter((seller) => {
        const rows = sellerWarehouses.get(String(seller.id)) || [];
        if (rows.length === 0) return true;
        return !rows.some(
          (warehouse) =>
            Boolean(warehouse.address?.trim()) &&
            Boolean(warehouse.city?.trim()) &&
            Boolean(warehouse.phone?.trim()) &&
            Boolean(warehouse.contactName?.trim()),
        );
      }).length;
      const sellerCourierUnlinked = sellers.filter((seller) => {
        const rows = sellerWarehouses.get(String(seller.id)) || [];
        if (rows.length === 0) return true;
        return !rows.some((warehouse) => Boolean(warehouse.pathaoStoreId));
      }).length;
      const sellerPayoutMissing = sellers.filter((seller) => !payoutReadyUserIds.has(String(seller.id))).length;

      const resellerVerificationIncomplete = resellers.filter(
        (reseller) => !reseller.emailVerified || !reseller.phoneVerified,
      ).length;
      const resellerCatalogEmpty = resellers.filter(
        (reseller) => Number(resellerMarkupMap.get(String(reseller.id)) || 0) === 0,
      ).length;
      const resellerPayoutMissing = resellers.filter((reseller) => !payoutReadyUserIds.has(String(reseller.id))).length;
      const resellerNoClicks = resellers.filter((reseller) => Number(resellerReferralMap.get(String(reseller.id))?.clicks || 0) === 0).length;

      res.json({
        salesSeries: buildHourlySeriesFromOrders(recentOrders, 12),
      activityHeatmap: buildWeeklyHeatmapFromOrders(recentOrders),
      lowStockProducts: lowStockProducts.map((product) => ({
        id: product.id,
        name: product.name,
        stock: product.stock,
        })),
        activeShipments,
        activeRiskFlags: riskFlags,
        readinessSummary: {
          sellers: {
            identity_incomplete: sellerIdentityIncomplete,
            verification_incomplete: sellerVerificationIncomplete,
            pickup_incomplete: sellerPickupIncomplete,
            courier_unlinked: sellerCourierUnlinked,
            payout_missing: sellerPayoutMissing,
          },
          resellers: {
            verification_incomplete: resellerVerificationIncomplete,
            catalog_empty: resellerCatalogEmpty,
            payout_missing: resellerPayoutMissing,
            no_clicks_yet: resellerNoClicks,
          },
        },
      });
    });

  app.get("/api/admin/operations-summary", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const [
      pendingKycReviews,
      pendingPayoutReviews,
      unreadSupportMessages,
      deliveryExceptions,
      lowStockProducts,
      pendingFlashSaleEntries,
      pendingReturnRequests,
      pendingAccountRequests,
    ] = await Promise.all([
      prisma.verificationSubmission.count({
        where: { status: "pending" },
      }),
      prisma.payoutTransaction.count({
        where: { status: "pending" },
      }),
      prisma.contactMessage.count({
        where: { status: "unread" },
      }),
      prisma.orderShipment.count({
        where: {
          status: { in: ["delivery_failed", "returned", "cancelled"] },
        },
      }),
      prisma.product.count({
        where: {
          stock: { lte: env.LOW_STOCK_THRESHOLD },
        },
      }),
      prisma.flashSaleEntry.count({
        where: { status: "pending" },
      }),
      prisma.accountActionRequest.count({
        where: {
          type: "return_request",
          status: "pending",
        },
      }),
      prisma.accountActionRequest.count({
        where: {
          status: "pending",
          type: { not: "return_request" },
        },
      }),
    ]);

    res.json({
      updatedAt: new Date().toISOString(),
      items: [
        {
          key: "kyc_reviews",
          label: "KYC reviews",
          count: pendingKycReviews,
          tone: pendingKycReviews > 0 ? "warning" : "healthy",
          description:
            pendingKycReviews > 0
              ? `${pendingKycReviews} seller or reseller verification submission${pendingKycReviews === 1 ? "" : "s"} waiting for review.`
              : "No seller or reseller verification backlog right now.",
          href: "/admin/users",
          actionLabel: "Review users",
        },
        {
          key: "payout_reviews",
          label: "Payout reviews",
          count: pendingPayoutReviews,
          tone: pendingPayoutReviews > 0 ? "warning" : "healthy",
          description:
            pendingPayoutReviews > 0
              ? `${pendingPayoutReviews} payout request${pendingPayoutReviews === 1 ? "" : "s"} need approval or rejection.`
              : "No pending payout review at the moment.",
          href: "/admin/payments",
          actionLabel: "Open payments",
        },
        {
          key: "support_inbox",
          label: "Support inbox",
          count: unreadSupportMessages,
          tone: unreadSupportMessages > 0 ? "warning" : "healthy",
          description:
            unreadSupportMessages > 0
              ? `${unreadSupportMessages} customer support message${unreadSupportMessages === 1 ? "" : "s"} are still unread.`
              : "Support inbox is currently clear.",
          href: "/admin/support",
          actionLabel: "Open support",
        },
        {
          key: "delivery_exceptions",
          label: "Delivery exceptions",
          count: deliveryExceptions,
          tone: deliveryExceptions > 0 ? "critical" : "healthy",
          description:
            deliveryExceptions > 0
              ? `${deliveryExceptions} shipment${deliveryExceptions === 1 ? "" : "s"} need manual follow-up after failed, returned, or cancelled delivery.`
              : "No shipment exceptions are waiting for intervention.",
          href: "/admin/orders",
          actionLabel: "Inspect orders",
        },
        {
          key: "low_stock",
          label: "Low stock products",
          count: lowStockProducts,
          tone: lowStockProducts > 0 ? "warning" : "healthy",
          description:
            lowStockProducts > 0
              ? `${lowStockProducts} product${lowStockProducts === 1 ? "" : "s"} are below the stock threshold.`
              : "Inventory levels are above the low-stock threshold.",
          href: lowStockProducts > 0 ? "/admin/inventory?section=po" : "/admin/inventory",
          actionLabel: lowStockProducts > 0 ? "Open restock queue" : "Open inventory",
        },
        {
          key: "flash_sale_entries",
          label: "Flash sale submissions",
          count: pendingFlashSaleEntries,
          tone: pendingFlashSaleEntries > 0 ? "warning" : "healthy",
          description:
            pendingFlashSaleEntries > 0
              ? `${pendingFlashSaleEntries} seller flash sale submission${pendingFlashSaleEntries === 1 ? "" : "s"} need review.`
              : "No flash sale submissions are waiting for approval.",
          href: "/admin/flash-sale",
          actionLabel: "Review campaign",
        },
        {
          key: "return_requests",
          label: "Return requests",
          count: pendingReturnRequests,
          tone: pendingReturnRequests > 0 ? "warning" : "healthy",
          description:
            pendingReturnRequests > 0
              ? `${pendingReturnRequests} customer return request${pendingReturnRequests === 1 ? "" : "s"} are waiting for review or refund action.`
              : "No return requests are waiting for review.",
          href: "/admin/returns",
          actionLabel: "Open returns",
        },
        {
          key: "account_requests",
          label: "Account requests",
          count: pendingAccountRequests,
          tone: pendingAccountRequests > 0 ? "warning" : "healthy",
          description:
            pendingAccountRequests > 0
              ? `${pendingAccountRequests} deactivate or delete request${pendingAccountRequests === 1 ? "" : "s"} are waiting for admin handling.`
              : "No pending account action requests right now.",
          href: "/admin/users",
          actionLabel: "Open users",
        },
      ],
    });
  });

  app.get("/api/admin/integrations/status", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const pathaoConfigured = Boolean(
      env.PATHAO_CLIENT_ID &&
      env.PATHAO_CLIENT_SECRET &&
      env.PATHAO_BASE_URL &&
      env.PATHAO_USERNAME &&
      env.PATHAO_PASSWORD,
    );
    const redxConfigured = Boolean(
      env.REDX_API_KEY &&
      env.REDX_SECRET_KEY &&
      env.REDX_BASE_URL &&
      env.REDX_BOOKING_ENDPOINT,
    );
    const steadfastConfigured = Boolean(
      env.STEADFAST_API_KEY &&
      env.STEADFAST_SECRET_KEY &&
      env.STEADFAST_BASE_URL,
    );
    const steadfastWebhookConfigured = Boolean(env.STEADFAST_WEBHOOK_TOKEN);
    const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);
    const resendConfigured = Boolean(env.RESEND_API_KEY);
    const emailConfigured = smtpConfigured || resendConfigured;
    const smsConfigured = Boolean(env.SMS_PROVIDER && env.SMS_API_KEY && env.SMS_SENDER_ID);
    const pushConfigured = Boolean(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY);
    const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    const sslcommerzConfigured = Boolean(env.SSLCOMMERZ_STORE_ID && env.SSLCOMMERZ_STORE_PASSWORD);
    const sslcommerzSandbox = String(env.SSLCOMMERZ_IS_SANDBOX || 'true').toLowerCase() !== 'false';
    const stripeWebhookConfigured = Boolean(env.STRIPE_WEBHOOK_SECRET);

    const items = [
      {
        key: 'email_delivery',
        label: 'Email delivery',
        status: emailConfigured ? 'ready' : 'missing',
        value: resendConfigured ? 'Resend API' : smtpConfigured ? 'SMTP' : 'Not configured',
        description: emailConfigured
          ? 'Transactional email is configured for verification, resets, orders, and recovery flows.'
          : 'Configure SMTP or Resend before going live with verification and order emails.',
      },
      {
        key: 'sms_otp',
        label: 'SMS / OTP',
        status: smsConfigured ? 'ready' : 'missing',
        value: smsConfigured ? String(env.SMS_PROVIDER).toUpperCase() : 'Not configured',
        description: smsConfigured
          ? 'Phone verification and SMS alert provider credentials are present.'
          : 'Add SMS provider, API key, and sender ID to support real OTP or SMS alerts.',
      },
      {
        key: 'web_push',
        label: 'Web push notifications',
        status: pushConfigured ? 'ready' : 'missing',
        value: pushConfigured ? 'VAPID keys detected' : 'Keys missing',
        description: pushConfigured
          ? 'Push notifications can be enabled for browser-based alerts.'
          : 'Generate and set VAPID keys to turn on production web push delivery.',
      },
      {
        key: 'google_auth',
        label: 'Social auth',
        status: googleConfigured ? 'ready' : 'missing',
        value: googleConfigured ? 'OAuth credentials set' : 'Not configured',
        description: googleConfigured
          ? 'Social login and role-aware social signup are configured through your auth provider.'
          : 'Configure social auth in Supabase and add any required OAuth credentials before enabling it in production.',
      },
      {
        key: 'stripe_payments',
        label: 'Stripe payments',
        status: stripeWebhookConfigured ? 'ready' : 'partial',
        value: stripeWebhookConfigured ? 'Secret + webhook set' : 'Webhook secret missing',
        description: stripeWebhookConfigured
          ? 'Stripe payment intents and webhook verification are ready for production.'
          : 'Stripe secret key exists, but webhook verification should be configured before launch.',
      },
      {
        key: 'sslcommerz',
        label: 'SSLCommerz',
        status: sslcommerzConfigured ? (sslcommerzSandbox ? 'sandbox' : 'ready') : 'missing',
        value: sslcommerzConfigured ? (sslcommerzSandbox ? 'Sandbox mode' : 'Live credentials') : 'Not configured',
        description: sslcommerzConfigured
          ? sslcommerzSandbox
            ? 'SSLCommerz credentials are present but still marked as sandbox mode.'
            : 'SSLCommerz credentials are configured for live payment processing.'
          : 'Add SSLCommerz store credentials if you want a live Bangladesh payment gateway fallback.',
      },
      {
        key: 'pathao_courier',
        label: 'Pathao Courier',
        status: pathaoConfigured ? 'ready' : 'missing',
        value: pathaoConfigured ? 'OAuth + booking config set' : 'Not configured',
        description: pathaoConfigured
          ? 'Pathao booking, store sync, webhook, and shipment sync layers are configured.'
          : 'Add Pathao merchant credentials and warehouse mapping before live auto-booking.',
      },
      {
        key: 'redx_courier',
        label: 'RedX Courier',
        status: redxConfigured ? 'ready' : 'missing',
        value: redxConfigured ? 'API booking config set' : 'Not configured',
        description: redxConfigured
          ? 'RedX booking credentials and endpoint are configured.'
          : 'Add RedX credentials and booking endpoint before enabling direct live booking.',
      },
      {
        key: 'steadfast_courier',
        label: 'Steadfast Courier',
        status: steadfastConfigured ? (steadfastWebhookConfigured ? 'ready' : 'partial') : 'partial',
        value: steadfastConfigured
          ? (steadfastWebhookConfigured ? 'API + webhook set' : 'API booking ready')
          : 'Manual merchant workflow',
        description: steadfastConfigured
          ? steadfastWebhookConfigured
            ? 'Steadfast API booking, webhook verification, and shipment sync are configured.'
            : 'Steadfast API booking is configured. Add STEADFAST_WEBHOOK_TOKEN to harden inbound sync.'
          : 'Steadfast manual merchant workflow is available with shipment tracking and seller/admin visibility.',
      },
    ];

    const summary = {
      ready: items.filter((item) => item.status === 'ready').length,
      partial: items.filter((item) => item.status === 'partial').length,
      sandbox: items.filter((item) => item.status === 'sandbox').length,
      missing: items.filter((item) => item.status === 'missing').length,
    };

    res.json({
      updatedAt: new Date().toISOString(),
      items,
      summary,
    });
  });

  app.get("/api/admin/pos", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const search = typeof req.query?.search === "string" ? req.query.search.trim() : "";
    const warehouseId = typeof req.query?.warehouseId === "string" ? req.query.warehouseId.trim() : "";
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [warehouses, products, recentOrders, todayOrders, cashierOrders, posTodayItems] = await Promise.all([
      prisma.warehouse.findMany({
        orderBy: [{ city: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          city: true,
        },
      }),
      prisma.product.findMany({
        where: {
          stock: { gt: 0 },
          ...(warehouseId
            ? {
                inventoryItems: {
                  some: {
                    warehouseId,
                    quantity: { gt: 0 },
                  },
                },
              }
            : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { slug: { contains: search, mode: "insensitive" } },
                  { category: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: {
          seller: {
            select: {
              name: true,
            },
          },
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
          },
        },
        orderBy: [{ stock: "desc" }, { updatedAt: "desc" }],
        take: search ? 40 : 24,
      }),
      prisma.order.findMany({
        where: {
          paymentProvider: "pos",
        },
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
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.order.findMany({
        where: {
          paymentProvider: "pos",
          createdAt: { gte: todayStart },
        },
        select: {
          id: true,
          total: true,
        },
      }),
      prisma.order.findMany({
        where: {
          paymentProvider: "pos",
          createdAt: { gte: todayStart },
          shipmentMetadata: {
            path: ["cashierId"],
            equals: String(req.user.id),
          },
        },
        select: {
          id: true,
          total: true,
          paymentMethod: true,
        },
      }),
      prisma.orderItem.findMany({
        where: {
          order: {
            paymentProvider: "pos",
            createdAt: { gte: todayStart },
          },
        },
        select: {
          productId: true,
          qty: true,
          price: true,
        },
      }),
    ]);

    const todayRevenue = todayOrders.reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
    const todayOrderCount = todayOrders.length;
    const cashierRevenue = cashierOrders.reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
    const cashSales = cashierOrders
      .filter((order) => String(order.paymentMethod || "").toLowerCase() === "cash")
      .reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
    const cardSales = cashierOrders
      .filter((order) => String(order.paymentMethod || "").toLowerCase() !== "cash")
      .reduce((sum, order) => sum + Number(toPlainNumber(order.total) ?? 0), 0);
    const topProductTotals = new Map<string, { quantity: number; revenue: number }>();
    for (const item of posTodayItems) {
      const existing = topProductTotals.get(item.productId) ?? { quantity: 0, revenue: 0 };
      existing.quantity += Number(item.qty);
      existing.revenue += Number(item.qty) * Number(toPlainNumber(item.price) ?? 0);
      topProductTotals.set(item.productId, existing);
    }
    const topPosProducts = [...topProductTotals.entries()]
      .map(([productId, totals]) => ({
        productId,
        quantity: totals.quantity,
        revenue: totals.revenue,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
    const topProductIds = topPosProducts.map((row) => row.productId);
    const topProductRows = topProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: {
            id: true,
            name: true,
          },
        })
      : [];
    const topProductMap = new Map(topProductRows.map((product) => [product.id, product.name]));

    res.json({
      updatedAt: new Date().toISOString(),
      summary: {
        today_sales: Number(todayRevenue.toFixed(2)),
        today_orders: todayOrderCount,
        average_ticket: todayOrderCount > 0 ? Number((todayRevenue / todayOrderCount).toFixed(2)) : 0,
      },
      shift_summary: {
        cashier_sales: Number(cashierRevenue.toFixed(2)),
        cashier_orders: cashierOrders.length,
        cash_sales: Number(cashSales.toFixed(2)),
        non_cash_sales: Number(cardSales.toFixed(2)),
      },
      close_summary: {
        generated_at: new Date().toISOString(),
        cashier_name: req.user.name ?? "Admin Cashier",
        total_sales: Number(todayRevenue.toFixed(2)),
        total_orders: todayOrderCount,
        cash_sales: Number(cashSales.toFixed(2)),
        non_cash_sales: Number(cardSales.toFixed(2)),
        top_items: topPosProducts.map((item) => ({
          product_id: item.productId,
          product_name: topProductMap.get(item.productId) ?? item.productId,
          quantity: Number(item.quantity),
          revenue_estimate: Number(item.revenue.toFixed(2)),
        })),
      },
      warehouses: warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
        city: warehouse.city,
      })),
      products: products.map((product) => ({
        ...serializeProduct(product),
        warehouse_stock: product.inventoryItems.map((entry) => ({
          warehouse_id: entry.warehouseId,
          warehouse_name: entry.warehouse?.name ?? "Warehouse",
          quantity: Number(entry.quantity),
        })),
      })),
      recentOrders: recentOrders.map(serializePosOrder),
    });
  });

  app.post("/api/admin/pos/checkout", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const paymentMethod = String(req.body?.paymentMethod || "cash").trim().toLowerCase();
    const customerName = String(req.body?.customerName || "").trim() || "Walk-in Customer";
    const customerPhone = String(req.body?.customerPhone || "").trim();
    const note = String(req.body?.note || "").trim();
    const selectedWarehouseId = String(req.body?.warehouseId || "").trim();

    if (items.length === 0) {
      return res.status(400).json({ error: "Select at least one product for the POS cart." });
    }

    const normalizedItems = items
      .map((item: any) => ({
        productId: String(item?.productId || item?.id || "").trim(),
        quantity: Math.max(1, Math.floor(Number(item?.quantity || 0))),
      }))
      .filter((item: { productId: string; quantity: number }) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);

    if (normalizedItems.length === 0) {
      return res.status(400).json({ error: "POS cart items are invalid." });
    }

    const walkInCustomer = await ensurePosWalkInCustomer(req.user.tenantId ?? null);
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
          orderBy: [{ quantity: "desc" }],
        },
      },
    });

    const productById = new Map(products.map((product) => [String(product.id), product]));
    for (const item of normalizedItems) {
      const product = productById.get(item.productId);
      if (!product) {
        return res.status(404).json({ error: `Product ${item.productId} not found.` });
      }
      if (Number(product.stock) < item.quantity) {
        return res.status(400).json({ error: `${product.name} only has ${product.stock} unit(s) available.` });
      }
      if (selectedWarehouseId) {
        const warehouseEntry = product.inventoryItems.find((entry) => entry.warehouseId === selectedWarehouseId);
        if (!warehouseEntry || Number(warehouseEntry.quantity) < item.quantity) {
          return res.status(400).json({ error: `${product.name} does not have enough stock in the selected warehouse.` });
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
          sellerId: product.sellerId ?? String(req.user.id),
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
          tenantId: req.user.tenantId ?? null,
          total,
          status: "delivered",
          paymentMethod,
          paymentProvider: "pos",
          paymentStatus: "paid",
          paidAt: now,
          deliveredAt: now,
          shippingAddress: {
            name: customerName,
            phone: customerPhone || null,
            address: "POS Counter Sale",
            city: "In-store",
            note: note || null,
            pos_sale: true,
          },
          shipmentMetadata: {
            pos_sale: true,
            cashierId: String(req.user.id),
            cashierName: req.user.name ?? "Admin Cashier",
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
        items: Array<{ orderItemId: string; productId: string; qty: number; price: number }>;
      }>();

      for (const item of computedItems) {
        const key = `${item.sellerId}::${item.warehouseId ?? "pos-counter"}`;
        const group: typeof shipmentGroups extends Map<string, infer U> ? U : never = shipmentGroups.get(key) ?? {
          sellerId: item.sellerId,
          warehouseId: item.warehouseId,
          total: 0,
          itemCount: 0,
          items: [],
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
        });
        shipmentGroups.set(key, group);
      }

      for (const group of shipmentGroups.values()) {
        const shipment = await tx.orderShipment.create({
          data: {
            orderId: order.id,
            sellerId: group.sellerId,
            warehouseId: group.warehouseId,
            status: "delivered",
            total: group.total,
            itemCount: group.itemCount,
            courierProvider: "pos",
            deliveredAt: now,
            shipmentMetadata: {
              pos_sale: true,
              cashierId: String(req.user.id),
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
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity,
            },
          },
        });
        if (item.warehouseId) {
          await tx.inventoryItem.updateMany({
            where: {
              productId: item.productId,
              warehouseId: item.warehouseId,
            },
            data: {
              quantity: {
                decrement: item.quantity,
              },
            },
          });
        }
        emitStockUpdate(updated.id as any, updated.stock);
      }

      await tx.invoice.create({
        data: {
          orderId: order.id,
          userId: walkInCustomer.id,
          status: "paid",
          subtotal: total,
          tax: 0,
          total,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          provider: "pos",
          paymentId: `POS-${order.id}`,
          orderId: order.id,
          customerId: walkInCustomer.id,
          amount: total,
          currency: "BDT",
          status: "paid",
          idempotencyKey: crypto.randomUUID(),
          metadata: {
            paymentMethod,
            cashierId: String(req.user.id),
            cashierName: req.user.name ?? "Admin Cashier",
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

    const debitAccountCode = paymentMethod === "cash" ? "1000" : "1010";
    await postAccountingEntrySafe({
      reference: `POS-SALE-${createdOrder.id}`,
      memo: `POS walk-in sale ${createdOrder.id}`,
      currency: "BDT",
      lines: [
        {
          accountCode: debitAccountCode,
          debit: Number(toPlainNumber(createdOrder.total) ?? 0),
          description: `POS ${paymentMethod} receipt`,
        },
        {
          accountCode: "4000",
          credit: Number(toPlainNumber(createdOrder.total) ?? 0),
          description: "POS product revenue",
        },
      ],
    });

    res.json({
      success: true,
      orderId: createdOrder.id,
      receipt: serializePosOrder(createdOrder),
    });
  });

  app.get("/api/admin/accounting", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    await accountingModule.ensureDefaultChartOfAccounts();

    const [accounts, journalEntries] = await Promise.all([
      prisma.ledgerAccount.findMany({
        include: {
          lines: {
            select: {
              debit: true,
              credit: true,
            },
          },
        },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      }),
      prisma.journalEntry.findMany({
        include: {
          lines: {
            include: {
              account: {
                select: {
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ]);

    const serializedAccounts = accounts.map((account) => {
      const debitTotal = account.lines.reduce((sum, line) => sum + Number(toPlainNumber(line.debit) || 0), 0);
      const creditTotal = account.lines.reduce((sum, line) => sum + Number(toPlainNumber(line.credit) || 0), 0);
      const balance =
        account.type === 'asset' || account.type === 'expense'
          ? debitTotal - creditTotal
          : creditTotal - debitTotal;

      return {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit_total: debitTotal,
        credit_total: creditTotal,
        balance,
        line_count: account.lines.length,
      };
    });

    const summary = serializedAccounts.reduce(
      (acc, account) => {
        if (account.type === 'asset') acc.assets += account.balance;
        if (account.type === 'liability') acc.liabilities += account.balance;
        if (account.type === 'equity') acc.equity += account.balance;
        if (account.type === 'revenue') acc.revenue += account.balance;
        if (account.type === 'expense') acc.expenses += account.balance;
        return acc;
      },
      { assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0 },
    );

    const trialBalance = {
      debit_total: serializedAccounts.reduce((sum, account) => sum + account.debit_total, 0),
      credit_total: serializedAccounts.reduce((sum, account) => sum + account.credit_total, 0),
      balanced:
        Math.abs(
          serializedAccounts.reduce((sum, account) => sum + account.debit_total, 0) -
            serializedAccounts.reduce((sum, account) => sum + account.credit_total, 0),
        ) < 0.0001,
    };

    const profitAndLoss = {
      revenue: summary.revenue,
      expenses: summary.expenses,
      net_income: summary.revenue - summary.expenses,
    };

    const cashSummary = {
      cash_on_hand:
        serializedAccounts.find((account) => account.code === '1000')?.balance ?? 0,
      stripe_clearing:
        serializedAccounts.find((account) => account.code === '1010')?.balance ?? 0,
      accounts_receivable:
        serializedAccounts.find((account) => account.code === '1100')?.balance ?? 0,
    };

    const payableSummary = {
      customer_wallet_liability:
        serializedAccounts.find((account) => account.code === '2100')?.balance ?? 0,
      seller_payout_payable:
        serializedAccounts.find((account) => account.code === '2200')?.balance ?? 0,
      reseller_payout_payable:
        serializedAccounts.find((account) => account.code === '2210')?.balance ?? 0,
    };

    res.json({
      updatedAt: new Date().toISOString(),
      summary: {
        ...summary,
        accounts: serializedAccounts.length,
        journal_entries: journalEntries.length,
        net_income: summary.revenue - summary.expenses,
      },
      reports: {
        trial_balance: trialBalance,
        profit_and_loss: profitAndLoss,
        cash_summary: cashSummary,
        payable_summary: payableSummary,
      },
      accounts: serializedAccounts,
      journalEntries: journalEntries.map((entry) => ({
        id: entry.id,
        reference: entry.reference,
        memo: entry.memo ?? null,
        currency: entry.currency,
        created_at: entry.createdAt.toISOString(),
        lines: entry.lines.map((line) => ({
          id: line.id,
          account_code: line.account.code,
          account_name: line.account.name,
          description: line.description ?? null,
          debit: Number(toPlainNumber(line.debit) || 0),
          credit: Number(toPlainNumber(line.credit) || 0),
        })),
      })),
    });
  });

  app.get("/api/admin/logistics/diagnostics", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    const providers = logisticsModule.listProviders();
    const [warehouses, activeShipments, exceptionShipments, pathaoWatchlistRaw, redxWatchlistRaw, steadfastWatchlistRaw, pathaoTokenHealth, recentPathaoStoreCount, pathaoShipmentCandidates] = await Promise.all([
      prisma.warehouse.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.orderShipment.count({
        where: {
          status: {
            in: ["processing", "packed", "ready_for_pickup", "pickup_requested", "picked_up", "in_transit", "out_for_delivery"],
          },
        },
      }),
      prisma.orderShipment.findMany({
        where: {
          status: { in: ["delivery_failed", "returned", "cancelled"] },
        },
        include: {
          order: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 12,
      }),
      prisma.orderShipment.findMany({
        where: {
          courierProvider: {
            contains: "pathao",
            mode: "insensitive",
          },
          trackingId: { not: null },
          status: {
            in: ["pickup_requested", "picked_up", "in_transit", "out_for_delivery"],
          },
        },
        include: {
          order: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.orderShipment.findMany({
        where: {
          courierProvider: {
            contains: "redx",
            mode: "insensitive",
          },
          trackingId: { not: null },
          status: {
            in: ["pickup_requested", "picked_up", "in_transit", "out_for_delivery"],
          },
        },
        include: {
          order: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.orderShipment.findMany({
        where: {
          courierProvider: {
            contains: "steadfast",
            mode: "insensitive",
          },
          trackingId: { not: null },
          status: {
            in: ["pickup_requested", "picked_up", "in_transit", "out_for_delivery"],
          },
        },
        include: {
          order: {
            select: {
              id: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      getPathaoTokenDiagnostics(),
      prisma.warehouse.count({
        where: {
          pathaoStoreId: { not: null },
        },
      }),
      prisma.orderShipment.findMany({
        where: {
          status: {
            in: ["ready_for_pickup", "pickup_requested", "picked_up", "in_transit", "out_for_delivery"],
          },
        },
        include: {
          order: {
            select: {
              id: true,
              paymentMethod: true,
              shippingAddress: true,
            },
          },
          warehouse: {
            select: {
              id: true,
              name: true,
              city: true,
              address: true,
              phone: true,
              contactName: true,
              secondaryContact: true,
              otpNumber: true,
              pathaoStoreId: true,
              pathaoCityId: true,
              pathaoZoneId: true,
              pathaoAreaId: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);

    const warehouseSummary = warehouses.reduce(
      (acc, warehouse) => {
        const hasAreaMapping = Boolean(warehouse.pathaoCityId && warehouse.pathaoZoneId && warehouse.pathaoAreaId);
        const hasStoreLink = Boolean(warehouse.pathaoStoreId);
        const hasShippingRules = Boolean(
          warehouse.insideDhakaFee != null &&
          warehouse.outsideDhakaFee != null &&
          warehouse.insideDhakaEta &&
          warehouse.outsideDhakaEta,
        );
        acc.total += 1;
        if (hasAreaMapping) acc.areaMapped += 1;
        if (hasStoreLink) acc.storeLinked += 1;
        if (hasShippingRules) acc.shippingRulesReady += 1;
        if (!hasAreaMapping || !hasStoreLink || !hasShippingRules) acc.needsAttention += 1;
        return acc;
      },
      { total: 0, areaMapped: 0, storeLinked: 0, shippingRulesReady: 0, needsAttention: 0 },
    );

    const warehouseHealth = warehouses
      .map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
        city: warehouse.city,
        contact_name: warehouse.contactName ?? null,
        phone: warehouse.phone ?? null,
        pathao_store_id: warehouse.pathaoStoreId ?? null,
        pathao_city_id: warehouse.pathaoCityId ?? null,
        pathao_zone_id: warehouse.pathaoZoneId ?? null,
        pathao_area_id: warehouse.pathaoAreaId ?? null,
        inside_dhaka_fee: warehouse.insideDhakaFee == null ? null : toPlainNumber(warehouse.insideDhakaFee),
        outside_dhaka_fee: warehouse.outsideDhakaFee == null ? null : toPlainNumber(warehouse.outsideDhakaFee),
        inside_dhaka_eta: warehouse.insideDhakaEta ?? null,
        outside_dhaka_eta: warehouse.outsideDhakaEta ?? null,
        mapping_ready: Boolean(warehouse.pathaoCityId && warehouse.pathaoZoneId && warehouse.pathaoAreaId),
        store_linked: Boolean(warehouse.pathaoStoreId),
        shipping_rules_ready: Boolean(
          warehouse.insideDhakaFee != null &&
          warehouse.outsideDhakaFee != null &&
          warehouse.insideDhakaEta &&
          warehouse.outsideDhakaEta,
        ),
      }))
      .filter((warehouse) => !warehouse.mapping_ready || !warehouse.store_linked || !warehouse.shipping_rules_ready)
      .slice(0, 12);

    const pathaoWatchlist = pathaoWatchlistRaw
      .map((shipment) => {
        const metadata =
          shipment.shipmentMetadata && typeof shipment.shipmentMetadata === "object"
            ? (shipment.shipmentMetadata as Record<string, any>)
            : {};
        const lastSyncAt = typeof metadata.pathaoLastSyncAt === "string" ? metadata.pathaoLastSyncAt : null;
        const bookingReference =
          typeof metadata.bookingReference === "string"
            ? metadata.bookingReference
            : typeof metadata.consignmentId === "string"
              ? metadata.consignmentId
              : shipment.trackingId;
        const syncAgeHours =
          lastSyncAt
            ? Math.round((Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60))
            : null;

        return {
          id: shipment.id,
          order_id: shipment.orderId,
          customer_name: shipment.order?.user?.name ?? null,
          warehouse_name: shipment.warehouse?.name ?? null,
          status: shipment.status,
          tracking_id: shipment.trackingId ?? null,
          booking_reference: bookingReference ?? null,
          pathao_last_event: typeof metadata.pathaoLastEvent === "string" ? metadata.pathaoLastEvent : null,
          pathao_last_status_slug: typeof metadata.pathaoLastStatusSlug === "string" ? metadata.pathaoLastStatusSlug : null,
          pathao_last_sync_at: lastSyncAt,
          sync_age_hours: syncAgeHours,
        };
      })
      .filter((shipment) => shipment.pathao_last_sync_at === null || (shipment.sync_age_hours ?? 0) >= 12)
      .slice(0, 10);

    const redxWatchlist = redxWatchlistRaw
      .map((shipment) => {
        const metadata =
          shipment.shipmentMetadata && typeof shipment.shipmentMetadata === "object"
            ? (shipment.shipmentMetadata as Record<string, any>)
            : {};
        const lastSyncAt = typeof metadata.redxLastSyncAt === "string" ? metadata.redxLastSyncAt : null;
        const bookingReference =
          typeof metadata.bookingReference === "string"
            ? metadata.bookingReference
            : shipment.trackingId;
        const syncAgeHours =
          lastSyncAt
            ? Math.round((Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60))
            : null;

        return {
          id: shipment.id,
          order_id: shipment.orderId,
          customer_name: shipment.order?.user?.name ?? null,
          warehouse_name: shipment.warehouse?.name ?? null,
          status: shipment.status,
          tracking_id: shipment.trackingId ?? null,
          booking_reference: bookingReference ?? null,
          redx_last_sync_at: lastSyncAt,
          sync_age_hours: syncAgeHours,
        };
      })
      .filter((shipment) => shipment.redx_last_sync_at === null || (shipment.sync_age_hours ?? 0) >= 12)
      .slice(0, 10);

    const steadfastWatchlist = steadfastWatchlistRaw
      .map((shipment) => {
        const metadata =
          shipment.shipmentMetadata && typeof shipment.shipmentMetadata === "object"
            ? (shipment.shipmentMetadata as Record<string, any>)
            : {};
        const lastSyncAt = typeof metadata.steadfastLastSyncAt === "string" ? metadata.steadfastLastSyncAt : null;
        const bookingReference =
          typeof metadata.bookingReference === "string"
            ? metadata.bookingReference
            : shipment.trackingId;
        const consignmentId =
          typeof metadata.consignmentId === 'string'
            ? metadata.consignmentId
            : typeof metadata.consignmentId === 'number'
              ? String(metadata.consignmentId)
              : null;
        const syncAgeHours =
          lastSyncAt
            ? Math.round((Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60))
            : null;

        return {
          id: shipment.id,
          order_id: shipment.orderId,
          customer_name: shipment.order?.user?.name ?? null,
          warehouse_name: shipment.warehouse?.name ?? null,
          status: shipment.status,
          tracking_id: shipment.trackingId ?? null,
          booking_reference: bookingReference ?? null,
          consignment_id: consignmentId,
          steadfast_last_sync_at: lastSyncAt,
          sync_age_hours: syncAgeHours,
        };
      })
      .filter((shipment) => shipment.steadfast_last_sync_at === null || (shipment.sync_age_hours ?? 0) >= 12)
      .slice(0, 10);

    const pathaoEnvChecks = [
      { key: 'PATHAO_BASE_URL', label: 'Base URL', ready: Boolean(env.PATHAO_BASE_URL) },
      { key: 'PATHAO_CLIENT_ID', label: 'Client ID', ready: Boolean(env.PATHAO_CLIENT_ID) },
      { key: 'PATHAO_CLIENT_SECRET', label: 'Client secret', ready: Boolean(env.PATHAO_CLIENT_SECRET) },
      { key: 'PATHAO_USERNAME', label: 'Merchant username', ready: Boolean(env.PATHAO_USERNAME) },
      { key: 'PATHAO_PASSWORD', label: 'Merchant password', ready: Boolean(env.PATHAO_PASSWORD) },
      { key: 'PATHAO_BOOKING_ENDPOINT', label: 'Booking endpoint', ready: Boolean(env.PATHAO_BOOKING_ENDPOINT) },
      { key: 'PATHAO_WEBHOOK_TOKEN', label: 'Webhook token', ready: Boolean(env.PATHAO_WEBHOOK_TOKEN) },
    ];

    const pathaoWarehouseBlockers = warehouses
      .map((warehouse) => {
        const blockers: string[] = [];
        if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) {
          blockers.push('Pathao area mapping missing');
        }
        if (!warehouse.pathaoStoreId) {
          blockers.push('Pathao store not linked');
        }
        if (!normalizeBangladeshPhone(warehouse.phone)) {
          blockers.push('Valid 11-digit warehouse phone missing');
        }
        if (!warehouse.contactName?.trim()) {
          blockers.push('Warehouse contact name missing');
        }

        return {
          id: warehouse.id,
          name: warehouse.name,
          blockers,
        };
      })
      .filter((warehouse) => warehouse.blockers.length > 0)
      .slice(0, 12);

    const pathaoBookingCandidates = pathaoShipmentCandidates.map((shipment) => {
      const shippingAddress =
        shipment.order.shippingAddress && typeof shipment.order.shippingAddress === 'object'
          ? (shipment.order.shippingAddress as Record<string, unknown>)
          : {};
      const blockers: string[] = [];
      const recipientPhone = normalizeBangladeshPhone(typeof shippingAddress.phone === 'string' ? shippingAddress.phone : null);
      const recipientAddress = typeof shippingAddress.address === 'string' ? shippingAddress.address.trim() : '';
      const warehouse = shipment.warehouse;

      if (!warehouse) {
        blockers.push('Shipment warehouse missing');
      } else {
        if (!warehouse.pathaoStoreId) blockers.push('Warehouse store link missing');
        if (!warehouse.pathaoCityId || !warehouse.pathaoZoneId || !warehouse.pathaoAreaId) blockers.push('Warehouse Pathao mapping missing');
        if (!normalizeBangladeshPhone(warehouse.phone)) blockers.push('Warehouse phone invalid');
        if (!warehouse.contactName?.trim()) blockers.push('Warehouse contact name missing');
      }

      if (!recipientPhone) blockers.push('Recipient phone invalid');
      if (recipientAddress.length < 10) blockers.push('Recipient address too short');

      return {
        id: shipment.id,
        order_id: shipment.orderId,
        warehouse_name: warehouse?.name ?? null,
        courier_provider: shipment.courierProvider ?? null,
        tracking_id: shipment.trackingId ?? null,
        status: shipment.status,
        blockers,
      };
    });

    res.json({
      updatedAt: new Date().toISOString(),
      providers,
      pathaoHealth: {
        ...pathaoTokenHealth,
        linkedStoreCount: recentPathaoStoreCount,
        webhookConfigured: Boolean(env.PATHAO_WEBHOOK_TOKEN),
      },
      steadfastHealth: {
        ...getSteadfastDiagnostics(),
      },
      pathaoReadiness: {
        envChecks: pathaoEnvChecks,
        envReady: pathaoEnvChecks.every((check) => check.ready),
        warehouseBlockers: pathaoWarehouseBlockers,
        bookingCandidates: pathaoBookingCandidates,
      },
      warehouseSummary,
      warehouseHealth,
      shipmentSummary: {
        active: activeShipments,
        exceptions: exceptionShipments.length,
        pathaoSyncAttention: pathaoWatchlist.length,
        redxSyncAttention: redxWatchlist.length,
        steadfastSyncAttention: steadfastWatchlist.length,
      },
      recentExceptions: exceptionShipments.map((shipment) => ({
        id: shipment.id,
        order_id: shipment.orderId,
        customer_name: shipment.order?.user?.name ?? null,
        warehouse_name: shipment.warehouse?.name ?? null,
        warehouse_city: shipment.warehouse?.city ?? null,
        status: shipment.status,
        courier_provider: shipment.courierProvider ?? null,
        tracking_id: shipment.trackingId ?? null,
        delivery_failure_reason: shipment.deliveryFailureReason ?? null,
        updated_at: shipment.updatedAt ? new Date(shipment.updatedAt).toISOString() : null,
      })),
      pathaoWatchlist,
      redxWatchlist,
      steadfastWatchlist,
    });
  });

  app.get("/api/admin/performance/web-vitals", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
      const requestedHours = Number.parseInt(String(req.query.hours ?? "24"), 10);
      const windowHours = Number.isFinite(requestedHours)
        ? Math.min(Math.max(requestedHours, 1), 24 * 7)
        : 24;
      const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
      const redis = await ensureRedis();
      const [rawItems, rawAlerts] = await Promise.all([
        redis.lrange(PERFORMANCE_EVENTS_KEY, 0, 299),
        redis.lrange(PERFORMANCE_ALERTS_KEY, 0, 39),
      ]);
      const items = rawItems
        .map((entry) => {
          try {
            return JSON.parse(entry);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as Array<{
          name: string;
          value: number;
          rating?: string | null;
          route: string;
          ts?: number;
        }>;
      const alerts = rawAlerts
        .map((entry) => {
          try {
            return JSON.parse(entry);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((entry) => Number(entry.ts ?? 0) >= cutoff)
        .slice(0, 10) as Array<{
          ts: number;
          route: string;
          metric: string;
          poorSamples: number;
          routePoorSamples: number;
          value?: number;
        }>;
      const filteredItems = items
        .filter((item) => Number(item.ts ?? 0) >= cutoff);

      const metricSummary = new Map<string, { total: number; count: number; poor: number; needsImprovement: number }>();
      const routeSummary = new Map<string, { samples: number; poor: number; lcpTotal: number; inpTotal: number }>();
      const bucketCount = 6;
      const bucketSizeMs = Math.max(1, Math.floor((windowHours * 60 * 60 * 1000) / bucketCount));
      const timeline = Array.from({ length: bucketCount }, (_, index) => ({
        label:
          windowHours <= 6
            ? `${bucketCount - index - 1}h`
            : `B${index + 1}`,
        samples: 0,
        poor: 0,
      }));

      for (const item of filteredItems) {
        const metric = item.name.replace(/^web-vital:/, '');
        const metricEntry = metricSummary.get(metric) ?? { total: 0, count: 0, poor: 0, needsImprovement: 0 };
        metricEntry.total += Number(item.value) || 0;
        metricEntry.count += 1;
        if (item.rating === 'poor') metricEntry.poor += 1;
        if (item.rating === 'needs-improvement') metricEntry.needsImprovement += 1;
        metricSummary.set(metric, metricEntry);

        const routeEntry = routeSummary.get(item.route) ?? { samples: 0, poor: 0, lcpTotal: 0, inpTotal: 0 };
        routeEntry.samples += 1;
        if (item.rating === 'poor') routeEntry.poor += 1;
        if (metric === 'LCP') routeEntry.lcpTotal += Number(item.value) || 0;
        if (metric === 'INP') routeEntry.inpTotal += Number(item.value) || 0;
        routeSummary.set(item.route, routeEntry);

        const ts = Number(item.ts ?? 0);
        if (ts >= cutoff) {
          const bucketIndex = Math.min(
            bucketCount - 1,
            Math.max(0, Math.floor((ts - cutoff) / bucketSizeMs)),
          );
          timeline[bucketIndex].samples += 1;
          if (item.rating === 'poor') {
            timeline[bucketIndex].poor += 1;
          }
        }
      }

      const metrics = Array.from(metricSummary.entries()).map(([name, entry]) => ({
        name,
        average: entry.count ? Number((entry.total / entry.count).toFixed(name === 'CLS' ? 4 : 0)) : 0,
        samples: entry.count,
        poor: entry.poor,
        needsImprovement: entry.needsImprovement,
      }));

      const routes = Array.from(routeSummary.entries())
        .map(([route, entry]) => ({
          route,
          samples: entry.samples,
          poor: entry.poor,
          avgLcp: entry.samples ? Math.round(entry.lcpTotal / Math.max(1, entry.samples)) : 0,
          avgInp: entry.samples ? Math.round(entry.inpTotal / Math.max(1, entry.samples)) : 0,
        }))
        .sort((a, b) => b.poor - a.poor || b.avgLcp - a.avgLcp)
        .slice(0, 8);

      const poorSamples = metrics.reduce((sum, metric) => sum + metric.poor, 0);
      const warningSamples = metrics.reduce((sum, metric) => sum + metric.needsImprovement, 0);
      const slowRoutes = routes.filter((route) => route.poor > 0);
      const alert =
        poorSamples > 0
          ? {
              severity: "critical",
              title: "Performance issues detected",
              message: `${poorSamples} poor vitals and ${slowRoutes.length} affected routes need attention in the last ${windowHours}h.`,
            }
          : warningSamples > 0
            ? {
                severity: "warning",
                title: "Performance needs monitoring",
                message: `${warningSamples} vitals need improvement across recent traffic in the last ${windowHours}h.`,
              }
            : {
                severity: "healthy",
                title: "Performance is healthy",
                message: `Recent browser vitals are within healthy thresholds for the last ${windowHours}h.`,
              };

      res.json({
        windowHours,
        totalEvents: filteredItems.length,
        lastUpdated: filteredItems[0]?.ts ?? null,
        metrics,
        routes,
        timeline,
        alert,
        alerts,
      });
    } catch {
      res.status(500).json({ error: 'Failed to load performance vitals' });
    }
  });

  app.post("/api/admin/performance/web-vitals/acknowledge", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    try {
      const ts = Number(req.body?.ts);
      const route = typeof req.body?.route === 'string' ? req.body.route : '';
      const metric = typeof req.body?.metric === 'string' ? req.body.metric : '';

      if (!Number.isFinite(ts) || !route || !metric) {
        return res.status(400).json({ error: 'Invalid alert acknowledgement payload' });
      }

      const redis = await ensureRedis();
      const rawAlerts = await redis.lrange(PERFORMANCE_ALERTS_KEY, 0, 49);
      const remainingAlerts = rawAlerts.filter((entry) => {
        try {
          const parsed = JSON.parse(entry);
          return !(
            Number(parsed?.ts) === ts &&
            String(parsed?.route || '') === route &&
            String(parsed?.metric || '') === metric
          );
        } catch {
          return false;
        }
      });

      const multi = redis.multi().del(PERFORMANCE_ALERTS_KEY);
      if (remainingAlerts.length > 0) {
        multi.rpush(PERFORMANCE_ALERTS_KEY, ...remainingAlerts).expire(PERFORMANCE_ALERTS_KEY, 60 * 60 * 24 * 14);
      }
      await multi.exec();

      await handleAuditLog(String(req.user.id), 'admin.performance.alert_acknowledged', 'performance_alert', `${metric}:${route}:${ts}`, {
        route,
        metric,
        ts,
      });

      res.json({ success: true });
    } catch {
      res.status(500).json({ error: 'Failed to acknowledge performance alert' });
    }
  });

  app.post("/api/admin/users/:id/role", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { role } = req.body;
    const allowedRoles = new Set(["customer", "seller", "reseller", "admin"]);
    if (!allowedRoles.has(String(role))) {
      return res.status(400).json({ error: "Invalid role provided" });
    }
    if (String(req.user.id) === req.params.id) {
      return res.status(400).json({ error: "You cannot change your own role from the admin panel" });
    }
    const updatedUser = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        role,
        sellerStatus: role === "seller" ? SELLER_STATUSES.draft : undefined,
        profileVisibility: role === "customer" ? "private" : "public",
      },
      select: {
        id: true,
        role: true,
        tenantId: true,
      },
    });
    await createNotification({
      userId: updatedUser.id,
      tenantId: updatedUser.tenantId ?? null,
      createdById: String(req.user.id),
      type: "account_action",
      title: "Account role updated",
      message: `Your account role has been updated to ${String(updatedUser.role).replaceAll("_", " ")}.`,
      actionUrl: getSettingsPathForRole(updatedUser.role, "profile"),
      metadata: {
        userId: updatedUser.id,
        role: updatedUser.role,
      },
    });
    await handleAuditLog(String(req.user.id), "admin.user.role_changed", "user", req.params.id, { role });
    res.json({ success: true });
  });

  app.delete("/api/admin/users/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    if (String(req.user.id) === req.params.id) {
      return res.status(400).json({ error: "You cannot delete your own admin account from the admin panel" });
    }
    await prisma.user.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });

  app.get("/api/admin/sellers", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const sellers = await prisma.user.findMany({
      where: { role: 'seller' },
      orderBy: { createdAt: 'desc' },
      include: {
        products: {
          select: {
            rating: true,
          },
        },
        _count: {
          select: {
            products: true,
            payoutMethods: true,
            warehouses: true,
          },
        },
        verificationSubmission: {
          select: {
            status: true,
            submittedAt: true,
            rejectionReason: true,
          },
        },
      },
    });
    res.json(
      sellers.map((seller) => {
        const ratings = seller.products.map((product) => product.rating).filter((value) => value > 0);
        const avgRating = ratings.length
          ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
          : null;

        return {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          shop_name: seller.storeName || seller.name,
          status: normalizeSellerStatus(seller.sellerStatus),
          submitted_for_review_at: seller.submittedForReviewAt ? seller.submittedForReviewAt.toISOString() : null,
          approved_at: seller.approvedAt ? seller.approvedAt.toISOString() : null,
          rejection_reason: seller.rejectionReason ?? null,
          suspension_reason: seller.suspensionReason ?? null,
          verification_status: seller.verificationSubmission?.status ?? null,
          pickup_count: seller._count.warehouses,
          payout_method_count: seller._count.payoutMethods,
          rating: avgRating,
          product_count: seller._count.products,
        };
      }),
    );
  });

  app.post("/api/admin/sellers/:id/status", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const requestedStatus = normalizeSellerStatus(req.body?.status);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const allowedStatuses = new Set<string>([
      SELLER_STATUSES.pending_review,
      SELLER_STATUSES.under_review,
      SELLER_STATUSES.approved,
      SELLER_STATUSES.rejected,
      SELLER_STATUSES.suspended,
    ]);
    if (!allowedStatuses.has(requestedStatus)) {
      return res.status(400).json({ error: "Invalid seller lifecycle status." });
    }
    if ((requestedStatus === SELLER_STATUSES.rejected || requestedStatus === SELLER_STATUSES.suspended) && reason.length < 5) {
      return res.status(400).json({ error: "Please provide a short reason for this seller status change." });
    }
    const updatedSeller = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        sellerStatus: requestedStatus,
        submittedForReviewAt:
          requestedStatus === SELLER_STATUSES.pending_review
            ? new Date()
            : requestedStatus === SELLER_STATUSES.draft
              ? null
              : undefined,
        approvedAt: requestedStatus === SELLER_STATUSES.approved ? new Date() : null,
        approvedById: requestedStatus === SELLER_STATUSES.approved ? String(req.user.id) : null,
        rejectionReason: requestedStatus === SELLER_STATUSES.rejected ? reason : null,
        suspensionReason: requestedStatus === SELLER_STATUSES.suspended ? reason : null,
        storefrontPublished: requestedStatus === SELLER_STATUSES.approved ? undefined : false,
      },
      select: {
        id: true,
        role: true,
        tenantId: true,
        sellerStatus: true,
        rejectionReason: true,
        suspensionReason: true,
      },
    });
    await createNotification({
      userId: updatedSeller.id,
      tenantId: updatedSeller.tenantId ?? null,
      createdById: String(req.user.id),
      type: "account_action",
      title:
        requestedStatus === SELLER_STATUSES.approved
          ? "Seller account approved"
          : requestedStatus === SELLER_STATUSES.rejected
            ? "Seller account needs updates"
            : requestedStatus === SELLER_STATUSES.suspended
              ? "Seller account suspended"
              : "Seller status updated",
      message:
        requestedStatus === SELLER_STATUSES.approved
          ? "Your seller account has been approved. You can now publish products, receive orders, and use live seller tools."
          : reason || `Your seller account status is now ${String(updatedSeller.sellerStatus || requestedStatus).replaceAll("_", " ")}.`,
      actionUrl: getSettingsPathForRole(updatedSeller.role, "profile"),
      metadata: {
        userId: updatedSeller.id,
        sellerStatus: updatedSeller.sellerStatus || requestedStatus,
      },
    });
    await handleAuditLog(String(req.user.id), "admin.seller.status_changed", "user", updatedSeller.id, {
      seller_status: requestedStatus,
      reason: reason || null,
    });
    res.json({ success: true });
  });

  app.get("/api/admin/return-requests", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const requests = await prisma.accountActionRequest.findMany({
      where: { type: "return_request" },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });

    const userIds = [...new Set(requests.map((request) => String(request.userId)).filter(Boolean))];
    const orderIds = [...new Set(requests.map((request) => String(request.orderId || "")).filter(Boolean))];
    const processedByIds = [...new Set(requests.map((request) => String(request.processedById || "")).filter(Boolean))];

    const [users, orders, processors] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      }),
      prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          total: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          courierProvider: true,
          trackingId: true,
        },
      }),
      prisma.user.findMany({
        where: { id: { in: processedByIds } },
        select: { id: true, name: true, email: true },
      }),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const processorMap = new Map(processors.map((user) => [user.id, user]));

    const summary = requests.reduce(
      (acc, request) => {
        const status = String(request.status || "pending").toLowerCase();
        acc.total += 1;
        if (status === "pending") acc.pending += 1;
        if (status === "approved") acc.approved += 1;
        if (status === "rejected") acc.rejected += 1;
        if (status === "refunded") acc.refunded += 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, rejected: 0, refunded: 0 },
    );

    res.json({
      summary,
      requests: requests.map((request) => {
        const customer = userMap.get(String(request.userId));
        const order = request.orderId ? orderMap.get(String(request.orderId)) : null;
        const processedBy = request.processedById ? processorMap.get(String(request.processedById)) : null;

        return {
          ...serializeAccountActionRequest(request),
          customer: customer
            ? {
                id: customer.id,
                name: customer.name,
                email: customer.email,
              }
            : null,
          order: order
            ? {
                id: order.id,
                total: toPlainNumber(order.total),
                status: order.status,
                payment_status: order.paymentStatus ?? null,
                courier_provider: order.courierProvider ?? null,
                tracking_id: order.trackingId ?? null,
                created_at: order.createdAt ? new Date(order.createdAt).toISOString() : null,
              }
            : null,
          processed_by: processedBy
            ? {
                id: processedBy.id,
                name: processedBy.name,
                email: processedBy.email,
              }
            : null,
        };
      }),
    });
  });

  app.patch("/api/admin/return-requests/:id/review", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);

    const nextStatus = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "";
    const resolutionNote = typeof req.body?.resolutionNote === "string" ? req.body.resolutionNote.trim() : "";

    if (!["approved", "rejected", "refunded"].includes(nextStatus)) {
      return res.status(400).json({ error: "Invalid return request action." });
    }

    if (nextStatus === "rejected" && resolutionNote.length < 5) {
      return res.status(400).json({ error: "Please add a short rejection note for the customer." });
    }

    const request = await prisma.accountActionRequest.findFirst({
      where: {
        id: req.params.id,
        type: "return_request",
      },
    });

    if (!request) {
      return res.status(404).json({ error: "Return request not found." });
    }

    const currentStatus = String(request.status || "pending").toLowerCase();
    const linkedOrder = request.orderId
      ? await prisma.order.findUnique({
          where: { id: String(request.orderId) },
          include: {
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                refunds: true,
              },
            },
          },
        })
      : null;

    if (currentStatus === "refunded") {
      return res.status(409).json({ error: "This return request has already been marked as refunded." });
    }

    if (nextStatus === "approved" && currentStatus !== "pending") {
      return res.status(409).json({ error: "Only pending return requests can be approved." });
    }

    if (nextStatus === "refunded" && currentStatus !== "approved") {
      return res.status(409).json({ error: "Only approved return requests can be marked as refunded." });
    }

    if (nextStatus === "refunded" && !linkedOrder) {
      return res.status(400).json({ error: "A linked order is required before this return can be marked as refunded." });
    }

    if (nextStatus === "rejected" && !["pending", "approved"].includes(currentStatus)) {
      return res.status(409).json({ error: "This return request cannot be rejected anymore." });
    }

    const updated = await prisma.accountActionRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        resolutionNote: resolutionNote || null,
        processedById: String(req.user.id),
        processedAt: new Date(),
      } as any,
    });

    if (nextStatus === "refunded" && linkedOrder) {
      const existingReward = await prisma.rewardLog.findFirst({
        where: {
          eventType: "return_refund",
          referenceId: request.id,
        },
        select: { id: true },
      });

      if (!existingReward) {
        await grantReward({
          userId: String(request.userId),
          tenantId: linkedOrder.tenantId ?? null,
          eventType: "return_refund",
          source: "return_refund",
          description: `Refund credited to wallet for order ${linkedOrder.id}`,
          walletAmount: Number(linkedOrder.total ?? 0),
          referenceId: request.id,
          metadata: {
            orderId: linkedOrder.id,
            requestId: request.id,
            refundMode: "wallet",
          },
        });
      }

      await prisma.order.update({
        where: { id: linkedOrder.id },
        data: {
          paymentStatus: "refunded",
          failureReason: null,
        },
      });

      await reverseResellerCommissionsForOrder(linkedOrder.id, "returned");

      await postAccountingEntrySafe({
        reference: `RETURN-REFUND-${request.id}`,
        memo: `Wallet refund processed for return request ${request.id} on order ${linkedOrder.id}`,
        currency: 'BDT',
        lines: [
          {
            accountCode: '4050',
            debit: Number(linkedOrder.total || 0),
            description: `Return refund expense for order ${linkedOrder.id}`,
          },
          {
            accountCode: '2100',
            credit: Number(linkedOrder.total || 0),
            description: `Wallet liability credited for return refund on order ${linkedOrder.id}`,
          },
        ],
      });

      const latestTransaction = linkedOrder.transactions[0];
      if (latestTransaction) {
        const providerRefundId = `wallet-return-${request.id}`;
        const existingRefund = latestTransaction.refunds.find((refund) => refund.providerRefundId === providerRefundId);
        if (!existingRefund) {
          await prisma.refund.create({
            data: {
              transactionId: latestTransaction.id,
              providerRefundId,
              amount: linkedOrder.total,
              reason: resolutionNote || request.reason || "Approved return refund credited to wallet",
              status: "completed",
            },
          });
        }
      }
    }

    const orderActionUrl = request.orderId
      ? `/account/orders/${request.orderId}?return=${request.id}`
      : "/account/orders";
    const statusLabel = nextStatus.replaceAll("_", " ");
    const title =
      nextStatus === "approved"
        ? "Return request approved"
        : nextStatus === "rejected"
          ? "Return request rejected"
          : "Refund processed";
    const message =
      nextStatus === "approved"
        ? `Your return request${request.orderId ? ` for order ${request.orderId}` : ""} has been approved for the next review step.`
        : nextStatus === "rejected"
        ? resolutionNote || "Your return request could not be approved."
          : `The refund for your approved return request${request.orderId ? ` on order ${request.orderId}` : ""} has been processed and credited to your wallet.`;

    await createNotification({
      userId: String(request.userId),
      type: "account_action",
      title,
      message,
      actionUrl: orderActionUrl,
      metadata: {
        requestId: request.id,
        orderId: request.orderId ?? null,
        type: "return_request",
        status: nextStatus,
      },
    });

    await handleAuditLog(String(req.user.id), `return_request.${nextStatus}`, "account_action_request", request.id, {
      orderId: request.orderId ?? null,
      previousStatus: currentStatus,
      status: nextStatus,
      resolutionNote: resolutionNote || null,
    });

    res.json({ success: true, request: serializeAccountActionRequest(updated) });
  });

  app.get("/api/admin/payments", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const [revenueAgg, pendingOrders, orderItems, paymentStatusGroups, pendingReturnRequests, recentRefundRows] = await Promise.all([
      prisma.order.aggregate({
        where: { status: { not: 'cancelled' } },
        _sum: { total: true },
      }),
      prisma.order.findMany({
        where: { status: { in: ['processing', 'shipped'] } },
        select: { id: true },
      }),
      prisma.orderItem.findMany({
        include: {
          order: {
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
          product: {
            select: {
              sellerId: true,
              seller: {
                select: { name: true },
              },
            },
          },
        },
      }),
      prisma.order.groupBy({
        by: ['paymentStatus'],
        _count: { _all: true },
        _sum: { total: true },
      }),
      prisma.accountActionRequest.count({
        where: {
          type: "return_request",
          status: "pending",
        },
      }),
      prisma.refund.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          transaction: {
            include: {
              order: {
                select: {
                  id: true,
                  userId: true,
                  total: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const pendingOrderIds = new Set(pendingOrders.map((order) => order.id));
    const payoutMap = new Map<string, { id: string; seller_name: string; amount: number; date: string; status: string }>();
    let pendingPayouts = 0;

    for (const item of orderItems) {
      const sellerId = item.product?.sellerId;
      const sellerName = item.product?.seller?.name;
      const order = item.order;
      if (!sellerId || !sellerName || !order) continue;

      const amount = Number(item.price) * item.qty;
      const key = `${order.id}:${sellerId}`;
      const existing = payoutMap.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        payoutMap.set(key, {
          id: `${order.id}-${sellerId}`,
          seller_name: sellerName,
          amount,
          date: order.createdAt.toISOString(),
          status: order.status,
        });
      }

      if (pendingOrderIds.has(order.id)) {
        pendingPayouts += amount;
      }
    }

    const recentPayouts = [...payoutMap.values()]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    const refundUserIds = [
      ...new Set(
        recentRefundRows
          .map((refund) => refund.transaction?.order?.userId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const refundUsers = refundUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: refundUserIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const refundUserMap = new Map(refundUsers.map((user) => [user.id, user]));

    const paymentSummary = paymentStatusGroups.reduce(
      (acc, entry) => {
        const key = String(entry.paymentStatus || 'untracked').toLowerCase();
        const count = Number(entry._count?._all || 0);
        const amount = toPlainNumber(entry._sum?.total ?? 0);

        if (key === 'paid') {
          acc.paidOrders += count;
          acc.paidAmount += amount;
        } else if (key === 'refunded') {
          acc.refundedOrders += count;
          acc.refundedAmount += amount;
        } else if (['failed', 'payment_failed'].includes(key)) {
          acc.failedOrders += count;
          acc.failedAmount += amount;
        } else if (['requires_payment', 'pending'].includes(key)) {
          acc.awaitingPaymentOrders += count;
          acc.awaitingPaymentAmount += amount;
        } else {
          acc.untrackedOrders += count;
        }

        return acc;
      },
      {
        paidOrders: 0,
        paidAmount: 0,
        refundedOrders: 0,
        refundedAmount: 0,
        failedOrders: 0,
        failedAmount: 0,
        awaitingPaymentOrders: 0,
        awaitingPaymentAmount: 0,
        untrackedOrders: 0,
      },
    );

    res.json({
      totalRevenue: toPlainNumber(revenueAgg._sum.total ?? 0),
      pendingPayouts,
      recentPayouts,
      recentRefunds: recentRefundRows.map((refund) => {
        const customerId = refund.transaction?.order?.userId ?? null;
        const customer = customerId ? refundUserMap.get(customerId) : null;
        return {
          id: refund.id,
          provider_refund_id: refund.providerRefundId,
          amount: toPlainNumber(refund.amount),
          status: refund.status,
          reason: refund.reason ?? null,
          created_at: refund.createdAt ? new Date(refund.createdAt).toISOString() : null,
          payment_provider: refund.transaction?.provider ?? null,
          order_id: refund.transaction?.order?.id ?? null,
          customer_name: customer?.name ?? null,
          customer_email: customer?.email ?? null,
        };
      }),
      paymentSummary,
      pendingReturnRequests,
    });
  });

  app.get("/api/admin/settings", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const [settings, commerceChannels] = await Promise.all([
      prismaDirect.platformSetting.findMany({
        orderBy: { key: 'asc' },
      }),
      getCommerceChannelSettings(),
    ]);
    const settingsMap = settings.reduce((acc: any, setting: any) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    Object.assign(settingsMap, {
      enabled_checkout_payment_methods: commerceChannels.checkoutPaymentMethods.join(','),
      enabled_manual_order_payment_methods: commerceChannels.manualOrderPaymentMethods.join(','),
      enabled_courier_providers: commerceChannels.courierProviders.join(','),
    });
    res.json(settingsMap);
  });

  app.patch("/api/admin/settings", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const updates = req.body;
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prismaDirect.platformSetting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        })
      )
    );
    await deleteCacheByPrefix("platform:commerce-channel-settings");
    await deleteCacheByPrefix("public:commerce-config");
    res.json({ success: true });
  });

  app.get("/api/admin/tenants", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    const tenants = await prisma.tenant.findMany({
      include: {
        settings: true,
        _count: {
          select: {
            users: true,
            products: true,
            orders: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      tenants.map((tenant) => ({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        settings: serializeTenantSetting(tenant.settings),
        stats: tenant._count,
        created_at: tenant.createdAt ? new Date(tenant.createdAt).toISOString() : undefined,
      })),
    );
  });

  app.get("/api/admin/gamification/config", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : null;
    const [setting, spinRewards] = await Promise.all([
      ensureTenantSetting(tenantId),
      prisma.spinReward.findMany({
        where: { tenantId: tenantId ?? null },
        orderBy: { displayOrder: "asc" },
      }),
    ]);

    res.json({
      settings: serializeTenantSetting(setting),
      spin_rewards: spinRewards.map(serializeSpinReward),
    });
  });

  app.patch("/api/admin/gamification/config", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const parsed = tenantSettingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid gamification settings" });
    }

    const tenantId = typeof req.body?.tenant_id === "string" ? req.body.tenant_id : null;
    if (!tenantId) {
      return res.status(400).json({ error: "tenant_id is required" });
    }

    const updated = await prisma.tenantSetting.upsert({
      where: { tenantId },
      update: {
        ...(parsed.data.currency !== undefined ? { currency: parsed.data.currency } : {}),
        ...(parsed.data.locale !== undefined ? { locale: parsed.data.locale } : {}),
        ...(parsed.data.free_shipping_threshold !== undefined ? { freeShippingThreshold: parsed.data.free_shipping_threshold } : {}),
        ...(parsed.data.cart_recovery_delay_mins !== undefined ? { cartRecoveryDelayMins: parsed.data.cart_recovery_delay_mins } : {}),
        ...(parsed.data.signup_bonus_coins !== undefined ? { signupBonusCoins: parsed.data.signup_bonus_coins } : {}),
        ...(parsed.data.daily_login_base_coins !== undefined ? { dailyLoginBaseCoins: parsed.data.daily_login_base_coins } : {}),
        ...(parsed.data.daily_login_max_coins !== undefined ? { dailyLoginMaxCoins: parsed.data.daily_login_max_coins } : {}),
        ...(parsed.data.order_cashback_bps !== undefined ? { orderCashbackBps: parsed.data.order_cashback_bps } : {}),
        ...(parsed.data.referral_inviter_coins !== undefined ? { referralInviterCoins: parsed.data.referral_inviter_coins } : {}),
        ...(parsed.data.referral_invitee_coins !== undefined ? { referralInviteeCoins: parsed.data.referral_invitee_coins } : {}),
        ...(parsed.data.surprise_reward_chance !== undefined ? { surpriseRewardChance: parsed.data.surprise_reward_chance } : {}),
        ...(parsed.data.spin_enabled !== undefined ? { spinEnabled: parsed.data.spin_enabled } : {}),
        ...(parsed.data.spin_daily_limit !== undefined ? { spinDailyLimit: parsed.data.spin_daily_limit } : {}),
        updatedById: String(req.user.id),
      },
      create: {
        tenantId,
        currency: parsed.data.currency ?? "BDT",
        locale: parsed.data.locale ?? "en-BD",
        freeShippingThreshold: parsed.data.free_shipping_threshold ?? 2500,
        cartRecoveryDelayMins: parsed.data.cart_recovery_delay_mins ?? 120,
        signupBonusCoins: parsed.data.signup_bonus_coins ?? 100,
        dailyLoginBaseCoins: parsed.data.daily_login_base_coins ?? 10,
        dailyLoginMaxCoins: parsed.data.daily_login_max_coins ?? 70,
        orderCashbackBps: parsed.data.order_cashback_bps ?? 200,
        referralInviterCoins: parsed.data.referral_inviter_coins ?? 150,
        referralInviteeCoins: parsed.data.referral_invitee_coins ?? 100,
        surpriseRewardChance: parsed.data.surprise_reward_chance ?? 0.15,
        spinEnabled: parsed.data.spin_enabled ?? true,
        spinDailyLimit: parsed.data.spin_daily_limit ?? 1,
        updatedById: String(req.user.id),
      },
    });

    res.json({ success: true, settings: serializeTenantSetting(updated) });
  });

  app.post("/api/admin/gamification/spin-rewards", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const parsed = spinRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid spin reward" });
    }

    const reward = await prisma.spinReward.create({
      data: {
        tenantId: typeof req.body?.tenant_id === "string" ? req.body.tenant_id : null,
        label: parsed.data.label,
        rewardType: parsed.data.reward_type,
        rewardValue: parsed.data.reward_value,
        probability: parsed.data.probability,
        isActive: parsed.data.is_active,
        displayOrder: parsed.data.display_order,
      },
    });

    res.json({ success: true, reward: serializeSpinReward(reward) });
  });

  app.get("/api/admin/gamification/analytics", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId : null;
    const [rewards, spins, streaks, referrals, walletTx] = await Promise.all([
      prisma.rewardLog.findMany({
        where: { tenantId: tenantId ?? null },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.spinHistory.count({
        where: { tenantId: tenantId ?? null },
      }),
      prisma.loginStreak.aggregate({
        _avg: { currentStreak: true },
        _max: { longestStreak: true },
      }),
      prisma.referralAttribution.count({
        where: { code: { tenantId: tenantId ?? null }, status: "rewarded" },
      }),
      prisma.walletTransaction.aggregate({
        where: { tenantId: tenantId ?? null },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      total_rewards_issued: rewards.length,
      total_coins_issued: rewards.reduce((sum, item) => sum + (item.coinsAmount ?? 0), 0),
      total_wallet_issued: rewards.reduce((sum, item) => sum + Number(item.walletAmount ?? 0), 0),
      total_spins: spins,
      average_streak: streaks._avg.currentStreak ?? 0,
      longest_streak: streaks._max.longestStreak ?? 0,
      successful_referrals: referrals,
      wallet_volume: toPlainNumber(walletTx._sum.amount ?? 0),
    });
  });

  app.post("/api/admin/wallet/adjust", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const parsed = walletAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid wallet adjustment" });
    }

    const user = await prisma.user.findUnique({
      where: { id: parsed.data.user_id },
      select: { tenantId: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await grantReward({
      userId: parsed.data.user_id,
      tenantId: user.tenantId ?? null,
      eventType: "admin_wallet_adjustment",
      source: parsed.data.source,
      description: parsed.data.description,
      walletAmount: parsed.data.type === "debit" ? -parsed.data.amount : parsed.data.amount,
    });

    await postAccountingEntrySafe({
      reference: `WALLET-ADJUST-${parsed.data.user_id}-${Date.now()}`,
      memo: parsed.data.description || `Admin wallet ${parsed.data.type} adjustment`,
      currency: 'BDT',
      lines:
        parsed.data.type === 'debit'
          ? [
              {
                accountCode: '2100',
                debit: parsed.data.amount,
                description: `Wallet liability reduced for user ${parsed.data.user_id}`,
              },
              {
                accountCode: '4200',
                credit: parsed.data.amount,
                description: `Wallet adjustment recovery for user ${parsed.data.user_id}`,
              },
            ]
          : [
              {
                accountCode: '6100',
                debit: parsed.data.amount,
                description: `Wallet adjustment expense for user ${parsed.data.user_id}`,
              },
              {
                accountCode: '2100',
                credit: parsed.data.amount,
                description: `Wallet liability increased for user ${parsed.data.user_id}`,
              },
            ],
    });

    await createNotification({
      userId: parsed.data.user_id,
      tenantId: user.tenantId ?? null,
      createdById: String(req.user.id),
      type: "reward",
      title: parsed.data.type === "debit" ? "Wallet adjustment applied" : "Wallet credit added",
      message:
        parsed.data.description ||
        (parsed.data.type === "debit"
          ? `An admin adjusted ${parsed.data.amount.toLocaleString()} BDT from your wallet balance.`
          : `${parsed.data.amount.toLocaleString()} BDT was added to your wallet balance.`),
      actionUrl: "/account/wallet",
      metadata: {
        amount: parsed.data.amount,
        adjustmentType: parsed.data.type,
        source: parsed.data.source,
      },
    });

    res.json({ success: true });
  });

  app.get("/api/admin/content/about", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    const rows = await prismaDirect.platformSetting.findMany({
      where: {
        key: {
          in: [
            "about_hero_title",
            "about_hero_highlight",
            "about_hero_description",
            "about_hero_image",
            "about_mission_title",
            "about_mission_body",
            "about_why_title",
            "about_why_body",
            "about_story_image",
            "about_hero_title_bn",
            "about_hero_highlight_bn",
            "about_hero_description_bn",
            "about_mission_title_bn",
            "about_mission_body_bn",
            "about_why_title_bn",
            "about_why_body_bn",
            "about_stats_json",
            "about_trust_cards_json",
            "about_team_json",
            "about_cta_en_json",
            "about_cta_bn_json",
          ],
        },
      },
      orderBy: { key: "asc" },
    });

    const settings = rows.reduce<Record<string, string>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    res.json(settings);
  });

  app.patch("/api/admin/content/about", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const allowedKeys = [
      "about_hero_title",
      "about_hero_highlight",
      "about_hero_description",
      "about_hero_image",
      "about_mission_title",
      "about_mission_body",
      "about_why_title",
      "about_why_body",
      "about_story_image",
      "about_hero_title_bn",
      "about_hero_highlight_bn",
      "about_hero_description_bn",
      "about_mission_title_bn",
      "about_mission_body_bn",
      "about_why_title_bn",
      "about_why_body_bn",
      "about_stats_json",
      "about_trust_cards_json",
      "about_team_json",
      "about_cta_en_json",
      "about_cta_bn_json",
    ];

    const updates = Object.entries(req.body || {}).filter(([key]) => allowedKeys.includes(key));
    await Promise.all(
      updates.map(([key, value]) =>
        prismaDirect.platformSetting.upsert({
          where: { key },
          update: { value: String(value ?? "") },
          create: { key, value: String(value ?? "") },
        }),
      ),
    );

    await handleAuditLog(String(req.user.id), "content.about.updated", "platform_setting", "about-page", {
      fields: updates.map(([key]) => key),
    });
    res.json({ success: true });
  });

  app.post("/api/notifications/unsubscribe", authenticateToken, async (req: any, res: any) => {
    const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
    if (!endpoint) return res.status(400).json({ error: "Subscription endpoint is required" });

    await prismaDirect.pushSubscription.deleteMany({
      where: {
        userId: String(req.user.id),
        endpoint,
      },
    });

    res.json({ success: true });
  });

  app.get("/api/admin/categories", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(categories.map(serializeCategory));
  });

  app.post("/api/admin/categories", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { name, icon } = req.body;
    await prisma.category.create({
      data: {
        name,
        icon: icon || null,
      },
    });
    res.json({ success: true });
  });

  app.delete("/api/admin/categories/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.category.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });

  app.get("/api/admin/subcategories", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const rows = await prisma.subcategory.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(rows.map(serializeSubcategory));
  });

  app.post("/api/admin/subcategories", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { category_id, name, icon } = req.body;
    const categoryId = String(category_id ?? '').trim();
    const trimmedName = String(name ?? '').trim();

    if (!categoryId) {
      return res.status(400).json({ error: "Parent category is required" });
    }

    if (!trimmedName) {
      return res.status(400).json({ error: "Subcategory name is required" });
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      return res.status(400).json({ error: "Selected parent category was not found" });
    }

    await prisma.subcategory.create({
      data: {
        categoryId,
        name: trimmedName,
        icon: icon || null,
      },
    });
    res.json({ success: true });
  });

  app.post("/api/admin/users/:id/block", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    if (String(req.user.id) === req.params.id) {
      return res.status(400).json({ error: "You cannot block your own admin account" });
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : null;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: reason,
      },
    });
    await createNotification({
      userId: user.id,
      createdById: String(req.user.id),
      type: "security",
      title: "Account access restricted",
      message: reason || "Your account has been temporarily blocked by the admin team. Contact support if you need help.",
      actionUrl: `/contact?subject=${encodeURIComponent("Account access support")}&message=${encodeURIComponent(
        `I need help with my account access. User ID: ${user.id}.`,
      )}`,
      metadata: {
        userId: user.id,
        action: "blocked",
        reason: reason || null,
      },
    });
    await revokeAllSessionsForUser(user.id);
    await markLoginActivitiesRevoked(user.id);
    await handleAuditLog(String(req.user.id), "admin.user.blocked", "user", user.id, { reason });
    res.json({ success: true, user: serializeUser(user) });
  });

  app.post("/api/admin/users/:id/unblock", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    if (String(req.user.id) === req.params.id) {
      return res.status(400).json({ error: "Your own admin account cannot be managed from this action" });
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        isBlocked: false,
        blockedAt: null,
        blockedReason: null,
      },
    });
    await createNotification({
      userId: user.id,
      createdById: String(req.user.id),
      type: "security",
      title: "Account access restored",
      message: "Your account access has been restored. You can sign in again now.",
      actionUrl: "/login",
      metadata: {
        userId: user.id,
        action: "unblocked",
      },
    });
    await handleAuditLog(String(req.user.id), "admin.user.unblocked", "user", user.id);
    res.json({ success: true, user: serializeUser(user) });
  });

  app.get("/api/admin/users/:id/login-activity", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);
    const activities = await prisma.loginActivity.findMany({
      where: { userId: req.params.id },
      orderBy: { loggedInAt: "desc" },
      take: 100,
    });

    res.json(activities.map(serializeLoginActivity));
  });

  app.get("/api/admin/users/:id/profile", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
        addresses: true,
        notificationPreference: true,
        verificationSubmission: {
          include: {
            reviewedBy: { select: { id: true, name: true, email: true } },
            documents: true,
          },
        },
        payoutMethods: true,
        payoutTransactions: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        riskFlags: {
          orderBy: { createdAt: "desc" },
        },
        products: {
          orderBy: { createdAt: "desc" },
          include: {
            seller: {
              select: {
                id: true,
                name: true,
                storeName: true,
                sellerStatus: true,
                storefrontPublished: true,
              },
            },
          },
        },
        warehouses: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      user: serializeUser(user),
      addresses: user.addresses.map(serializeAddress),
      notification_preferences: serializeNotificationPreference(user.notificationPreference),
      verification: serializeVerificationSubmission(user.verificationSubmission),
      payout_methods: user.payoutMethods.map(serializePayoutMethod),
      transactions: user.payoutTransactions.map(serializePayoutTransaction),
      risk_flags: user.riskFlags.map(serializeRiskFlag),
      products: user.products.map(serializeProduct),
      pickup_locations: user.warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
        address: warehouse.address,
        city: warehouse.city,
        phone: warehouse.phone,
        contact_name: warehouse.contactName ?? null,
        pathao_store_id: warehouse.pathaoStoreId ?? null,
      })),
      seller_approval: user.role === "seller"
        ? {
            status: normalizeSellerStatus(user.sellerStatus),
            submitted_for_review_at: user.submittedForReviewAt ? user.submittedForReviewAt.toISOString() : null,
            approved_at: user.approvedAt ? user.approvedAt.toISOString() : null,
            approved_by: user.approvedBy
              ? {
                  id: user.approvedBy.id,
                  name: user.approvedBy.name,
                  email: user.approvedBy.email,
                }
              : null,
            rejection_reason: user.rejectionReason ?? null,
            suspension_reason: user.suspensionReason ?? null,
          }
        : null,
    });
  });

  app.get("/api/admin/verification-queue", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);

    const submissions = await prisma.verificationSubmission.findMany({
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, avatarUrl: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true },
        },
        documents: true,
      },
    });

    res.json(
      submissions.map((submission) => ({
        ...serializeVerificationSubmission(submission),
        user: submission.user,
      })),
    );
  });

  app.post("/api/admin/verification-queue/:id/review", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);

    const parsed = verificationReviewSchema.safeParse({
      ...req.body,
      risk_score: typeof req.body?.risk_score === "undefined" ? undefined : Number(req.body.risk_score),
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid verification review payload" });
    }

    const updated = await prisma.verificationSubmission.update({
      where: { id: req.params.id },
      data: {
        status: parsed.data.status,
        rejectionReason: parsed.data.rejection_reason || null,
        riskScore: parsed.data.risk_score ?? 0,
        notes: parsed.data.notes || null,
        reviewedAt: new Date(),
        reviewedById: String(req.user.id),
      },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true } },
        documents: true,
        user: { select: { id: true, role: true, tenantId: true } },
      },
    });

    await createNotification({
      userId: updated.user.id,
      tenantId: updated.user.tenantId ?? null,
      createdById: String(req.user.id),
      type: "verification",
      title: updated.status === "verified" ? "Verification approved" : updated.status === "rejected" ? "Verification needs attention" : "Verification updated",
      message:
        updated.status === "verified"
          ? "Your verification submission has been approved."
          : updated.rejectionReason || "Your verification submission was reviewed. Please check the latest update.",
      actionUrl: getSettingsPathForRole(updated.user.role, "verification"),
      metadata: {
        verificationId: updated.id,
        status: updated.status,
        role: updated.user.role,
      },
    });

    await handleAuditLog(String(req.user.id), "admin.verification.reviewed", "verification_submission", updated.id, {
      status: updated.status,
      risk_score: updated.riskScore,
    });

    res.json({ success: true, verification: serializeVerificationSubmission(updated) });
  });

  app.post("/api/admin/users/:id/risk-flags", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);

    const parsed = riskFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid risk flag payload" });
    }

    const flag = await prisma.userRiskFlag.create({
      data: {
        userId: req.params.id,
        createdById: String(req.user.id),
        severity: parsed.data.severity,
        reason: parsed.data.reason,
        notes: parsed.data.notes || null,
      },
    });

    const flaggedUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { role: true },
    });

    await createNotification({
      userId: req.params.id,
      createdById: String(req.user.id),
      type: "security",
      title: "Account review alert",
      message: parsed.data.notes || parsed.data.reason,
      actionUrl: getSettingsPathForRole(flaggedUser?.role, "security"),
      metadata: {
        riskFlagId: flag.id,
        severity: flag.severity,
        reason: flag.reason,
      },
    });

    await handleAuditLog(String(req.user.id), "admin.risk_flag.created", "user_risk_flag", flag.id, { severity: flag.severity });
    res.json({ success: true, risk_flag: serializeRiskFlag(flag) });
  });

  app.get("/api/admin/payout-transactions", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);

    const transactions = await prisma.payoutTransaction.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        payoutMethod: true,
      },
      take: 100,
    });

    res.json(
      transactions.map((transaction) => ({
        ...serializePayoutTransaction(transaction),
        user: transaction.user,
        payout_method: transaction.payoutMethod ? serializePayoutMethod(transaction.payoutMethod) : null,
      })),
    );
  });

  app.post("/api/admin/payout-transactions/:id/review", authenticateToken, async (req: any, res) => {
    if (req.user.role !== "admin") return res.sendStatus(403);

    const status = ["approved", "rejected", "paid"].includes(String(req.body?.status))
      ? String(req.body.status)
      : null;

    if (!status) {
      return res.status(400).json({ error: "A valid payout review status is required" });
    }

    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() : null;

    const transaction = await prisma.payoutTransaction.update({
      where: { id: req.params.id },
      data: {
        status,
        notes: notes || undefined,
        processedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            tenantId: true,
            role: true,
          },
        },
      },
    });

    const payoutAmount = Number(toPlainNumber(transaction.amount) || 0);
    const payableAccountCode = transaction.user.role === 'reseller' ? '2210' : '2200';

    if (status === 'approved') {
      await postAccountingEntrySafe({
        reference: `PAYOUT-APPROVED-${transaction.id}`,
        memo: `Payout request approved for ${transaction.user.role} ${transaction.user.id}`,
        currency: 'BDT',
        lines: [
          {
            accountCode: '6200',
            debit: payoutAmount,
            description: `Partner settlement approved for payout ${transaction.id}`,
          },
          {
            accountCode: payableAccountCode,
            credit: payoutAmount,
            description: `Payout liability created for ${transaction.id}`,
          },
        ],
      });
    }

    if (status === 'paid') {
      await postAccountingEntrySafe({
        reference: `PAYOUT-PAID-${transaction.id}`,
        memo: `Payout paid for ${transaction.user.role} ${transaction.user.id}`,
        currency: 'BDT',
        lines: [
          {
            accountCode: payableAccountCode,
            debit: payoutAmount,
            description: `Payout liability settled for ${transaction.id}`,
          },
          {
            accountCode: '1000',
            credit: payoutAmount,
            description: `Cash paid out for ${transaction.id}`,
          },
        ],
      });
    }

    await createNotification({
      userId: transaction.user.id,
      tenantId: transaction.user.tenantId ?? null,
      createdById: String(req.user.id),
      type: "payout",
      title: status === "approved" ? "Payout request approved" : status === "rejected" ? "Payout request rejected" : "Payout sent",
      message:
        status === "approved"
          ? "Your payout request has been approved and is queued for processing."
          : status === "rejected"
            ? notes || "Your payout request could not be approved."
            : "Your payout has been marked as paid.",
      actionUrl: getSettingsPathForRole(transaction.user.role, "payout"),
      metadata: {
        payoutTransactionId: transaction.id,
        status,
      },
    });

    await handleAuditLog(String(req.user.id), "admin.payout.reviewed", "payout_transaction", transaction.id, { status });
    res.json({ success: true, transaction: serializePayoutTransaction(transaction) });
  });

  app.delete("/api/admin/subcategories/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.subcategory.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });

  app.get("/api/admin/subsubcategories", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const rows = await prisma.subsubcategory.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(rows.map(serializeSubsubcategory));
  });

  app.post("/api/admin/subsubcategories", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { subcategory_id, name } = req.body;
    const subcategoryId = String(subcategory_id ?? '').trim();
    const trimmedName = String(name ?? '').trim();

    if (!subcategoryId) {
      return res.status(400).json({ error: "Parent subcategory is required" });
    }

    if (!trimmedName) {
      return res.status(400).json({ error: "Sub-subcategory name is required" });
    }

    const subcategory = await prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      select: { id: true },
    });

    if (!subcategory) {
      return res.status(400).json({ error: "Selected parent subcategory was not found" });
    }

    await prisma.subsubcategory.create({
      data: {
        subcategoryId,
        name: trimmedName,
      },
    });
    res.json({ success: true });
  });

  app.delete("/api/admin/subsubcategories/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.subsubcategory.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });

  app.get("/api/categories/tree", async (req: any, res) => {
    const payload = await getOrSetCache(
      "categories:tree",
      async () => {
        const tree = await prisma.category.findMany({
          orderBy: { name: 'asc' },
          include: {
            subcategories: {
              orderBy: { name: 'asc' },
              include: {
                subsubcategories: {
                  orderBy: { name: 'asc' },
                },
              },
            },
          },
        });

        return tree.map((category) => ({
          ...serializeCategory(category),
          subcategories: category.subcategories.map((subcategory: any) => ({
            ...serializeSubcategory(subcategory),
            subsubcategories: subcategory.subsubcategories.map(serializeSubsubcategory),
          })),
        }));
      },
      600,
    );

    res.json(payload);
  });
  app.get("/api/admin/orders", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        shipments: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                city: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    res.json(
      orders.map((order) => ({
        ...serializeOrder(order),
        customer_email: order.user?.email ?? null,
      })),
    );
  });

  app.patch("/api/admin/orders/:id/status", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { status, courierProvider, trackingId, deliveryFailureReason } = req.body;
    const timestampData: Record<string, unknown> = {};
    if (status === 'pickup_requested') timestampData.pickupRequestedAt = new Date();
    if (status === 'picked_up') timestampData.pickedUpAt = new Date();
    if (status === 'out_for_delivery') timestampData.outForDeliveryAt = new Date();
    if (status === 'delivered') timestampData.deliveredAt = new Date();
    if (status !== 'delivery_failed') timestampData.deliveryFailureReason = null;
    if (status === 'delivery_failed' && typeof deliveryFailureReason === 'string' && deliveryFailureReason.trim()) {
      timestampData.deliveryFailureReason = deliveryFailureReason.trim();
    }

    const updatedOrder = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status,
        courierProvider: typeof courierProvider === 'string' && courierProvider.trim() ? courierProvider.trim() : undefined,
        trackingId: typeof trackingId === 'string' && trackingId.trim() ? trackingId.trim() : undefined,
        ...timestampData,
      } as any,
    });
    if (status === 'delivered') {
      await settleResellerCommissionsForOrder(updatedOrder.id);
    } else if (status === 'cancelled' || status === 'returned' || status === 'delivery_failed') {
      await reverseResellerCommissionsForOrder(updatedOrder.id, status);
    }
    res.json({ success: true });
  });

  app.get("/api/admin/coupons", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            storeName: true,
          },
        },
      },
    });
    res.json(coupons.map(serializeCoupon));
  });

  app.post("/api/admin/coupons", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { code, discount_type, discount_value, min_order_value, expiry_date } = req.body;
    await prisma.coupon.create({
      data: {
        code,
        discountType: discount_type === 'fixed' ? 'flat' : discount_type,
        discountValue: Number(discount_value),
        minOrderValue: Number(min_order_value || 0),
        expiryDate: new Date(expiry_date),
      },
    });
    res.json({ success: true });
  });

  app.delete("/api/admin/coupons/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.coupon.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });

  app.get("/api/seller/coupons", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const coupons = await prisma.coupon.findMany({
      where: { sellerId: String(req.user.id) },
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            storeName: true,
          },
        },
      },
    });
    res.json(coupons.map(serializeCoupon));
  });

  app.post("/api/seller/coupons", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const { code, discount_type, discount_value, min_order_value, expiry_date } = req.body;
    const created = await prisma.coupon.create({
      data: {
        sellerId: String(req.user.id),
        code: String(code || '').trim().toUpperCase(),
        discountType: discount_type === 'fixed' ? 'flat' : discount_type,
        discountValue: Number(discount_value),
        minOrderValue: Number(min_order_value || 0),
        expiryDate: new Date(expiry_date),
      },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            storeName: true,
          },
        },
      },
    });
    res.json(serializeCoupon(created));
  });

  app.delete("/api/seller/coupons/:id", authenticateToken, requireRole("seller"), async (req: any, res) => {
    const coupon = await prisma.coupon.findFirst({
      where: {
        id: String(req.params.id),
        sellerId: String(req.user.id),
      },
      select: { id: true },
    });

    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    await prisma.coupon.delete({
      where: { id: coupon.id },
    });
    res.json({ success: true });
  });

  app.get("/api/admin/flash-sale", authenticateToken, requireRole("admin"), async (_req: any, res) => {
    try {
      const campaigns = await prisma.flashSaleCampaign.findMany({
        orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { name: true } },
          entries: {
            include: {
              product: {
                include: {
                  seller: { select: { name: true } },
                },
              },
              seller: { select: { name: true } },
              reviewedBy: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      res.json(campaigns.map(serializeFlashSaleCampaign));
    } catch (error) {
      res.status(500).json({ error: "Failed to load flash sale campaigns" });
    }
  });

  app.post("/api/admin/flash-sale", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const bannerImage = typeof req.body?.bannerImage === "string" ? req.body.bannerImage.trim() : "";
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "draft";
    const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : null;
    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;

    if (!title || !startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: "Title, start date, and end date are required" });
    }

    if (endsAt <= startsAt) {
      return res.status(400).json({ error: "End date must be later than the start date" });
    }

    try {
      const baseSlug = buildFlashSaleSlug(title);
      const conflict = await prisma.flashSaleCampaign.findUnique({ where: { slug: baseSlug } });

      const campaign = await prisma.flashSaleCampaign.create({
        data: {
          title,
          slug: conflict ? `${baseSlug}-${crypto.randomBytes(2).toString("hex")}` : baseSlug,
          description: description || null,
          bannerImage: bannerImage || null,
          startsAt,
          endsAt,
          status,
          createdById: String(req.user.id),
        },
        include: {
          createdBy: { select: { name: true } },
          entries: true,
        },
      });

      await deleteCacheByPrefix("flash-sale:");
      res.json({ success: true, campaign: serializeFlashSaleCampaign(campaign) });
    } catch (error) {
      res.status(500).json({ error: "Failed to create flash sale campaign" });
    }
  });

  app.patch("/api/admin/flash-sale/:id", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const bannerImage = typeof req.body?.bannerImage === "string" ? req.body.bannerImage.trim() : "";
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    const startsAt = req.body?.startsAt ? new Date(req.body.startsAt) : null;
    const endsAt = req.body?.endsAt ? new Date(req.body.endsAt) : null;

    if (!title || !startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return res.status(400).json({ error: "Title, start date, and end date are required" });
    }

    if (endsAt <= startsAt) {
      return res.status(400).json({ error: "End date must be later than the start date" });
    }

    try {
      const current = await prisma.flashSaleCampaign.findUnique({
        where: { id: req.params.id },
      });

      if (!current) {
        return res.status(404).json({ error: "Flash sale campaign not found" });
      }

      const nextSlug = current.title === title ? current.slug : buildFlashSaleSlug(title);
      const slugConflict =
        nextSlug !== current.slug
          ? await prisma.flashSaleCampaign.findFirst({
              where: {
                slug: nextSlug,
                id: { not: current.id },
              },
            })
          : null;

      const campaign = await prisma.flashSaleCampaign.update({
        where: { id: current.id },
        data: {
          title,
          slug: slugConflict ? `${nextSlug}-${crypto.randomBytes(2).toString("hex")}` : nextSlug,
          description: description || null,
          bannerImage: bannerImage || null,
          startsAt,
          endsAt,
          status: status || current.status,
        },
        include: {
          createdBy: { select: { name: true } },
          entries: {
            include: {
              product: {
                include: {
                  seller: { select: { name: true } },
                },
              },
              seller: { select: { name: true } },
              reviewedBy: { select: { name: true } },
            },
          },
        },
      });

      await deleteCacheByPrefix("flash-sale:");
      res.json({ success: true, campaign: serializeFlashSaleCampaign(campaign) });
    } catch (error) {
      res.status(500).json({ error: "Failed to update flash sale campaign" });
    }
  });

  app.patch("/api/admin/flash-sale/entries/:id/review", authenticateToken, requireRole("admin"), async (req: any, res) => {
    const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
    const rejectionReason = typeof req.body?.rejectionReason === "string" ? req.body.rejectionReason.trim() : "";

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid review status" });
    }

    try {
      const entry = await prisma.flashSaleEntry.update({
        where: { id: req.params.id },
        data: {
          status,
          rejectionReason: status === "rejected" ? rejectionReason || "Not approved for this campaign" : null,
          reviewedById: String(req.user.id),
          reviewedAt: new Date(),
        },
        include: {
          product: {
            include: {
              seller: { select: { name: true } },
            },
          },
          seller: { select: { name: true } },
          reviewedBy: { select: { name: true } },
        },
      });

      await createNotification({
        userId: entry.sellerId,
        createdById: String(req.user.id),
        type: "flash_sale",
        title: status === "approved" ? "Flash sale entry approved" : status === "rejected" ? "Flash sale entry rejected" : "Flash sale entry updated",
        message:
          status === "approved"
            ? `${entry.product?.name || "Your product"} has been approved for the flash sale campaign.`
            : status === "rejected"
              ? rejectionReason || `${entry.product?.name || "Your product"} was not approved for this flash sale campaign.`
              : `${entry.product?.name || "Your product"} is back in pending review.`,
        actionUrl: `/seller/flash-sale?entry=${entry.id}`,
        metadata: {
          entryId: entry.id,
          campaignId: entry.campaignId,
          productId: entry.productId,
          status: entry.status,
        },
      });

      await deleteCacheByPrefix("flash-sale:");
      res.json({ success: true, entry: serializeFlashSaleEntry(entry) });
    } catch (error) {
      res.status(500).json({ error: "Failed to review flash sale entry" });
    }
  });

  app.get("/api/admin/reviews", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const reviews = await prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
        product: { select: { name: true } },
      },
    });
    res.json(
      reviews.map((review) => ({
        ...serializeReview(review),
        user_name: review.user?.name ?? '',
        product_name: review.product?.name ?? '',
      })),
    );
  });

  app.delete("/api/admin/reviews/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prisma.review.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });

  app.get("/api/admin/blog", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const posts = await prismaDirect.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { name: true } },
      },
    });
    res.json(posts.map(serializeBlogPost));
  });

  app.get("/api/blog", async (_req: any, res) => {
    const payload = await getOrSetCache(
      "blog:list",
      async () => {
        const posts = await prismaDirect.blogPost.findMany({
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { name: true } },
          },
          take: 24,
        });

        return posts.map(serializeBlogPost);
      },
      300,
    );

    res.json(payload);
  });

  app.get("/api/blog/:slug", async (req: any, res) => {
    const post = await getOrSetCache(
      `blog:post:${req.params.slug}`,
      async () => {
        const row = await prismaDirect.blogPost.findFirst({
          where: {
            OR: [
              { slug: req.params.slug },
              { id: req.params.slug },
            ],
          },
          include: {
            author: { select: { name: true } },
          },
        });

        return row ? serializeBlogPost(row) : null;
      },
      600,
    );

    if (!post) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    res.json(post);
  });

  app.post("/api/admin/blog", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, slug, excerpt, category, content, image, seoTitle, seoDescription } = req.body;
    await prismaDirect.blogPost.create({
      data: {
        title,
        slug,
        excerpt,
        category,
        content,
        image,
        seoTitle,
        seoDescription,
        authorId: String(req.user.id),
      },
    });
    await deleteCacheByPrefix("blog:");
    res.json({ success: true });
  });

  app.patch("/api/admin/blog/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, slug, excerpt, category, content, image, seoTitle, seoDescription } = req.body;
    await prismaDirect.blogPost.update({
      where: { id: req.params.id },
      data: {
        title,
        slug,
        excerpt,
        category,
        content,
        image,
        seoTitle,
        seoDescription,
      },
    });
    await deleteCacheByPrefix("blog:");
    res.json({ success: true });
  });

  app.delete("/api/admin/blog/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prismaDirect.blogPost.delete({
      where: { id: req.params.id },
    });
    await deleteCacheByPrefix("blog:");
    res.json({ success: true });
  });

  app.get("/api/admin/messages", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const messages = await prismaDirect.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(messages.map(serializeContactMessage));
  });

  app.patch("/api/admin/messages/:id/status", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { status } = req.body;
    await prismaDirect.contactMessage.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json({ success: true });
  });

  app.delete("/api/admin/messages/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prismaDirect.contactMessage.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });

  app.post("/api/contact", async (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const subject = String(req.body?.subject ?? '').trim();
    const message = String(req.body?.message ?? '').trim();

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: "Name, email, subject, and message are required" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: "A valid email address is required" });
    }

    const created = await prismaDirect.contactMessage.create({
      data: {
        name,
        email,
        subject,
        message,
      },
    });

    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          type: "support",
          title: "New support message received",
          message: `${name} sent a new support message${subject ? ` about "${subject}"` : ""}.`,
          actionUrl: `/admin/support?message=${created.id}&search=${encodeURIComponent(email || subject || created.id)}`,
          metadata: {
            messageId: created.id,
            customerEmail: email,
            subject,
          },
        }),
      ),
    );

    res.status(201).json({
      success: true,
      message: "Your message has been sent to support",
      id: created.id,
    });
  });

  app.get("/api/banners", async (req, res) => {
    const banners = await prismaDirect.banner.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(banners.map(serializeBanner));
  });

  app.get("/api/admin/banners", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const banners = await prismaDirect.banner.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(banners.map(serializeBanner));
  });

  app.post("/api/admin/banners", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, subtitle, image, link, button_text } = req.body;
    await prismaDirect.banner.create({
      data: {
        title,
        subtitle,
        image,
        link,
        buttonText: button_text,
      },
    });
    res.json({ success: true });
  });

  app.patch("/api/admin/banners/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { title, subtitle, image, link, button_text, is_active } = req.body;
    await prismaDirect.banner.update({
      where: { id: req.params.id },
      data: {
        title,
        subtitle,
        image,
        link,
        buttonText: button_text,
        isActive: Boolean(is_active),
      },
    });
    res.json({ success: true });
  });

  app.delete("/api/admin/banners/:id", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await prismaDirect.banner.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  });
  app.get("/api/addresses", authenticateToken, async (req: any, res) => {
    const addresses = await prisma.address.findMany({
      where: { userId: String(req.user.id) },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
      ],
    });
    res.json(addresses.map(serializeAddress));
  });

  app.post("/api/addresses", authenticateToken, async (req: any, res) => {
    const parsed = addressSchema.safeParse({
      ...req.body,
      is_default: Boolean(req.body?.is_default),
      type: req.body?.type || "shipping",
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid address payload" });
    }
    const userId = String(req.user.id);
    const payload = parsed.data;

    const created = await prisma.$transaction(async (tx) => {
      if (payload.is_default) {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          userId,
          label: payload.label || null,
          type: payload.type,
          name: payload.name,
          phone: payload.phone,
          alternatePhone: payload.alternate_phone || null,
          address: payload.address,
          line2: payload.line2 || null,
          division: payload.division || null,
          district: payload.district || null,
          upazila: payload.upazila || null,
          house: payload.house || null,
          road: payload.road || null,
          village: payload.village || null,
          city: payload.city,
          state: payload.state || null,
          postalCode: payload.postal_code || null,
          country: payload.country,
          isDefault: payload.is_default,
        },
      });
    });

    res.json({ success: true, id: created.id });
  });

  app.patch("/api/addresses/:id", authenticateToken, async (req: any, res) => {
    const parsed = addressSchema.safeParse({
      ...req.body,
      is_default: Boolean(req.body?.is_default),
      type: req.body?.type || "shipping",
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid address payload" });
    }

    const existing = await prisma.address.findFirst({
      where: { id: req.params.id, userId: String(req.user.id) },
    });
    if (!existing) return res.status(404).json({ error: "Address not found" });

    const payload = parsed.data;
    const updated = await prisma.$transaction(async (tx) => {
      if (payload.is_default) {
        await tx.address.updateMany({
          where: { userId: String(req.user.id) },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: existing.id },
        data: {
          label: payload.label || null,
          type: payload.type,
          name: payload.name,
          phone: payload.phone,
          alternatePhone: payload.alternate_phone || null,
          address: payload.address,
          line2: payload.line2 || null,
          division: payload.division || null,
          district: payload.district || null,
          upazila: payload.upazila || null,
          house: payload.house || null,
          road: payload.road || null,
          village: payload.village || null,
          city: payload.city,
          state: payload.state || null,
          postalCode: payload.postal_code || null,
          country: payload.country,
          isDefault: payload.is_default,
        },
      });
    });

    res.json({ success: true, address: serializeAddress(updated) });
  });

  app.delete("/api/addresses/:id", authenticateToken, async (req: any, res) => {
    const existing = await prisma.address.findFirst({
      where: { id: req.params.id, userId: String(req.user.id) },
    });
    if (!existing) return res.status(404).json({ error: "Address not found" });

    await prisma.address.delete({ where: { id: existing.id } });
    res.json({ success: true });
  });

  // AI Chatbot endpoint
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const historySummary = Array.isArray(history)
      ? history
          .slice(-6)
          .map((entry: any) => `${entry?.role === 'assistant' ? 'Assistant' : 'User'}: ${String(entry?.content || '').slice(0, 300)}`)
          .join('\n')
      : '';

    const prompt = `You are the helpful commerce assistant for LofiMart.
Help with product discovery, order tracking, courier updates, seller questions, and general shopping advice.
Keep answers concise, trustworthy, and practical.

Recent conversation:
${historySummary || 'No prior conversation.'}

User message: ${message}`;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    res.json({ response: result.text });
  } catch {
    res.status(500).json({ error: "Failed to generate AI response" });
  }
});

// Inventory Endpoints (for Inventory components)
app.get("/api/admin/inventory/warehouses", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const warehouses = await prisma.warehouse.findMany({
    where: req.user.role === 'seller' ? { managerId: String(req.user.id) } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  res.json(warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
    location: {
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state ?? undefined,
      country: warehouse.country,
      postalCode: warehouse.postalCode,
    },
    contact: {
      name: warehouse.contactName ?? undefined,
      phone: warehouse.phone ?? undefined,
      email: warehouse.email ?? undefined,
      secondaryPhone: warehouse.secondaryContact ?? undefined,
      otpNumber: warehouse.otpNumber ?? undefined,
    },
    pathao: {
      storeId: warehouse.pathaoStoreId ?? undefined,
      cityId: warehouse.pathaoCityId ?? undefined,
      zoneId: warehouse.pathaoZoneId ?? undefined,
      areaId: warehouse.pathaoAreaId ?? undefined,
    },
    shipping: {
      insideDhakaFee: warehouse.insideDhakaFee == null ? undefined : toPlainNumber(warehouse.insideDhakaFee),
      outsideDhakaFee: warehouse.outsideDhakaFee == null ? undefined : toPlainNumber(warehouse.outsideDhakaFee),
      insideDhakaEta: warehouse.insideDhakaEta ?? undefined,
      outsideDhakaEta: warehouse.outsideDhakaEta ?? undefined,
      freeShippingThresholdOverride:
        warehouse.freeShippingThresholdOverride == null ? undefined : toPlainNumber(warehouse.freeShippingThresholdOverride),
    },
    capacity: {
      maxItems: warehouse.maxItems ?? undefined,
      maxWeightKg: warehouse.maxWeightKg ?? undefined,
    },
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
  })));
});

app.post("/api/admin/inventory/warehouses", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const address = typeof req.body?.location?.address === 'string' ? req.body.location.address.trim() : '';
  const city = typeof req.body?.location?.city === 'string' ? req.body.location.city.trim() : '';
  const country = typeof req.body?.location?.country === 'string' ? req.body.location.country.trim() : 'Bangladesh';
  const postalCode = typeof req.body?.location?.postalCode === 'string' ? req.body.location.postalCode.trim() : '';
  const state = typeof req.body?.location?.state === 'string' ? req.body.location.state.trim() : undefined;
  const phone = typeof req.body?.contact?.phone === 'string' ? req.body.contact.phone.trim() : undefined;
  const email = typeof req.body?.contact?.email === 'string' ? req.body.contact.email.trim() : undefined;
  const contactName = typeof req.body?.contact?.name === 'string' ? req.body.contact.name.trim() : undefined;
  const secondaryContact = typeof req.body?.contact?.secondaryPhone === 'string' ? req.body.contact.secondaryPhone.trim() : undefined;
  const otpNumber = typeof req.body?.contact?.otpNumber === 'string' ? req.body.contact.otpNumber.trim() : undefined;
  const insideDhakaFee =
    req.body?.shipping?.insideDhakaFee === null || req.body?.shipping?.insideDhakaFee === ''
      ? null
      : Number.isFinite(Number(req.body?.shipping?.insideDhakaFee))
        ? Number(req.body.shipping.insideDhakaFee)
        : undefined;
  const outsideDhakaFee =
    req.body?.shipping?.outsideDhakaFee === null || req.body?.shipping?.outsideDhakaFee === ''
      ? null
      : Number.isFinite(Number(req.body?.shipping?.outsideDhakaFee))
        ? Number(req.body.shipping.outsideDhakaFee)
        : undefined;
  const freeShippingThresholdOverride =
    req.body?.shipping?.freeShippingThresholdOverride === null || req.body?.shipping?.freeShippingThresholdOverride === ''
      ? null
      : Number.isFinite(Number(req.body?.shipping?.freeShippingThresholdOverride))
        ? Number(req.body.shipping.freeShippingThresholdOverride)
        : undefined;
  const insideDhakaEta = typeof req.body?.shipping?.insideDhakaEta === 'string' ? req.body.shipping.insideDhakaEta.trim() : undefined;
  const outsideDhakaEta = typeof req.body?.shipping?.outsideDhakaEta === 'string' ? req.body.shipping.outsideDhakaEta.trim() : undefined;

  if (!name || !address || !city || !postalCode) {
    return res.status(400).json({ error: 'Warehouse name, address, city, and postal code are required' });
  }

  try {
    const warehouse = await prisma.warehouse.create({
      data: {
        name,
        address,
        city,
        country,
        postalCode,
        state: state || null,
        phone: phone || null,
        email: email || null,
        contactName: contactName || null,
        secondaryContact: secondaryContact || null,
        otpNumber: otpNumber || null,
        insideDhakaFee: insideDhakaFee === undefined ? null : insideDhakaFee,
        outsideDhakaFee: outsideDhakaFee === undefined ? null : outsideDhakaFee,
        insideDhakaEta: insideDhakaEta || null,
        outsideDhakaEta: outsideDhakaEta || null,
        freeShippingThresholdOverride: freeShippingThresholdOverride === undefined ? null : freeShippingThresholdOverride,
        managerId: req.user.role === 'seller' ? String(req.user.id) : null,
      },
    });

    res.json({
      id: warehouse.id,
      name: warehouse.name,
      location: {
        address: warehouse.address,
        city: warehouse.city,
        state: warehouse.state ?? undefined,
        country: warehouse.country,
        postalCode: warehouse.postalCode,
      },
      contact: {
        name: warehouse.contactName ?? undefined,
        phone: warehouse.phone ?? undefined,
        email: warehouse.email ?? undefined,
        secondaryPhone: warehouse.secondaryContact ?? undefined,
        otpNumber: warehouse.otpNumber ?? undefined,
      },
      pathao: {},
      shipping: {
        insideDhakaFee: warehouse.insideDhakaFee == null ? undefined : toPlainNumber(warehouse.insideDhakaFee),
        outsideDhakaFee: warehouse.outsideDhakaFee == null ? undefined : toPlainNumber(warehouse.outsideDhakaFee),
        insideDhakaEta: warehouse.insideDhakaEta ?? undefined,
        outsideDhakaEta: warehouse.outsideDhakaEta ?? undefined,
        freeShippingThresholdOverride:
          warehouse.freeShippingThresholdOverride == null ? undefined : toPlainNumber(warehouse.freeShippingThresholdOverride),
      },
      capacity: {
        maxItems: warehouse.maxItems ?? undefined,
        maxWeightKg: warehouse.maxWeightKg ?? undefined,
      },
      createdAt: warehouse.createdAt.toISOString(),
      updatedAt: warehouse.updatedAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to create warehouse' });
  }
});

app.delete("/api/admin/inventory/warehouses/:id", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: req.params.id },
      select: { id: true, managerId: true },
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    if (req.user.role === 'seller' && warehouse.managerId && warehouse.managerId !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.warehouse.delete({ where: { id: warehouse.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete warehouse' });
  }
});

app.patch("/api/admin/inventory/warehouses/:id", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  try {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: req.params.id },
      select: { id: true, managerId: true },
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }

    if (req.user.role === 'seller' && warehouse.managerId && warehouse.managerId !== String(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const address = typeof req.body?.location?.address === 'string' ? req.body.location.address.trim() : '';
    const city = typeof req.body?.location?.city === 'string' ? req.body.location.city.trim() : '';
    const country = typeof req.body?.location?.country === 'string' ? req.body.location.country.trim() : 'Bangladesh';
    const postalCode = typeof req.body?.location?.postalCode === 'string' ? req.body.location.postalCode.trim() : '';
    const state = typeof req.body?.location?.state === 'string' ? req.body.location.state.trim() : undefined;
    const phone = typeof req.body?.contact?.phone === 'string' ? req.body.contact.phone.trim() : undefined;
    const email = typeof req.body?.contact?.email === 'string' ? req.body.contact.email.trim() : undefined;
    const contactName = typeof req.body?.contact?.name === 'string' ? req.body.contact.name.trim() : undefined;
    const secondaryContact = typeof req.body?.contact?.secondaryPhone === 'string' ? req.body.contact.secondaryPhone.trim() : undefined;
    const otpNumber = typeof req.body?.contact?.otpNumber === 'string' ? req.body.contact.otpNumber.trim() : undefined;
    const insideDhakaFee =
      req.body?.shipping?.insideDhakaFee === null || req.body?.shipping?.insideDhakaFee === ''
        ? null
        : Number.isFinite(Number(req.body?.shipping?.insideDhakaFee))
          ? Number(req.body.shipping.insideDhakaFee)
          : undefined;
    const outsideDhakaFee =
      req.body?.shipping?.outsideDhakaFee === null || req.body?.shipping?.outsideDhakaFee === ''
        ? null
        : Number.isFinite(Number(req.body?.shipping?.outsideDhakaFee))
          ? Number(req.body.shipping.outsideDhakaFee)
          : undefined;
    const freeShippingThresholdOverride =
      req.body?.shipping?.freeShippingThresholdOverride === null || req.body?.shipping?.freeShippingThresholdOverride === ''
        ? null
        : Number.isFinite(Number(req.body?.shipping?.freeShippingThresholdOverride))
          ? Number(req.body.shipping.freeShippingThresholdOverride)
          : undefined;
    const insideDhakaEta = typeof req.body?.shipping?.insideDhakaEta === 'string' ? req.body.shipping.insideDhakaEta.trim() : undefined;
    const outsideDhakaEta = typeof req.body?.shipping?.outsideDhakaEta === 'string' ? req.body.shipping.outsideDhakaEta.trim() : undefined;
    const maxItems =
      req.body?.capacity?.maxItems === null || req.body?.capacity?.maxItems === ''
        ? null
        : Number.isFinite(Number(req.body?.capacity?.maxItems))
          ? Number(req.body.capacity.maxItems)
          : undefined;
    const maxWeightKg =
      req.body?.capacity?.maxWeightKg === null || req.body?.capacity?.maxWeightKg === ''
        ? null
        : Number.isFinite(Number(req.body?.capacity?.maxWeightKg))
          ? Number(req.body.capacity.maxWeightKg)
          : undefined;

    if (!name || !address || !city || !postalCode) {
      return res.status(400).json({ error: 'Warehouse name, address, city, and postal code are required' });
    }

    const updated = await prisma.warehouse.update({
      where: { id: warehouse.id },
      data: {
        name,
        address,
        city,
        country,
        postalCode,
        state: state || null,
        phone: phone || null,
        email: email || null,
        contactName: contactName || null,
        secondaryContact: secondaryContact || null,
        otpNumber: otpNumber || null,
        insideDhakaFee: insideDhakaFee === undefined ? undefined : insideDhakaFee,
        outsideDhakaFee: outsideDhakaFee === undefined ? undefined : outsideDhakaFee,
        insideDhakaEta: insideDhakaEta === undefined ? undefined : insideDhakaEta || null,
        outsideDhakaEta: outsideDhakaEta === undefined ? undefined : outsideDhakaEta || null,
        freeShippingThresholdOverride:
          freeShippingThresholdOverride === undefined ? undefined : freeShippingThresholdOverride,
        maxItems: maxItems === undefined ? undefined : maxItems,
        maxWeightKg: maxWeightKg === undefined ? undefined : maxWeightKg,
      },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      location: {
        address: updated.address,
        city: updated.city,
        state: updated.state ?? undefined,
        country: updated.country,
        postalCode: updated.postalCode,
      },
      contact: {
        name: updated.contactName ?? undefined,
        phone: updated.phone ?? undefined,
        email: updated.email ?? undefined,
        secondaryPhone: updated.secondaryContact ?? undefined,
        otpNumber: updated.otpNumber ?? undefined,
      },
      pathao: {
        storeId: updated.pathaoStoreId ?? undefined,
        cityId: updated.pathaoCityId ?? undefined,
        zoneId: updated.pathaoZoneId ?? undefined,
        areaId: updated.pathaoAreaId ?? undefined,
      },
      shipping: {
        insideDhakaFee: updated.insideDhakaFee == null ? undefined : toPlainNumber(updated.insideDhakaFee),
        outsideDhakaFee: updated.outsideDhakaFee == null ? undefined : toPlainNumber(updated.outsideDhakaFee),
        insideDhakaEta: updated.insideDhakaEta ?? undefined,
        outsideDhakaEta: updated.outsideDhakaEta ?? undefined,
        freeShippingThresholdOverride:
          updated.freeShippingThresholdOverride == null ? undefined : toPlainNumber(updated.freeShippingThresholdOverride),
      },
      capacity: {
        maxItems: updated.maxItems ?? undefined,
        maxWeightKg: updated.maxWeightKg ?? undefined,
      },
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to update warehouse' });
  }
});

app.patch("/api/admin/inventory/warehouses/:id/pathao", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const pathaoStoreId =
    req.body?.storeId === null || req.body?.storeId === ''
      ? null
      : Number.isFinite(Number(req.body?.storeId))
        ? Number(req.body.storeId)
        : undefined;
  const pathaoCityId =
    req.body?.cityId === null || req.body?.cityId === ''
      ? null
      : Number.isFinite(Number(req.body?.cityId))
        ? Number(req.body.cityId)
        : undefined;
  const pathaoZoneId =
    req.body?.zoneId === null || req.body?.zoneId === ''
      ? null
      : Number.isFinite(Number(req.body?.zoneId))
        ? Number(req.body.zoneId)
        : undefined;
  const pathaoAreaId =
    req.body?.areaId === null || req.body?.areaId === ''
      ? null
      : Number.isFinite(Number(req.body?.areaId))
        ? Number(req.body.areaId)
        : undefined;
  const contactName = typeof req.body?.contactName === 'string' ? req.body.contactName.trim() : undefined;
  const secondaryContact = typeof req.body?.secondaryContact === 'string' ? req.body.secondaryContact.trim() : undefined;
  const otpNumber = typeof req.body?.otpNumber === 'string' ? req.body.otpNumber.trim() : undefined;

  try {
    if (req.user.role === 'seller') {
      const warehouse = await prisma.warehouse.findUnique({
        where: { id: req.params.id },
        select: { id: true, managerId: true },
      });

      if (!warehouse) {
        return res.status(404).json({ error: 'Warehouse not found' });
      }

      if (warehouse.managerId && warehouse.managerId !== String(req.user.id)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const updated = await prisma.warehouse.update({
      where: { id: req.params.id },
      data: {
        pathaoStoreId,
        pathaoCityId,
        pathaoZoneId,
        pathaoAreaId,
        contactName: contactName || undefined,
        secondaryContact: secondaryContact || undefined,
        otpNumber: otpNumber || undefined,
      },
    });

    res.json({
      success: true,
      warehouse: {
        id: updated.id,
        name: updated.name,
        pathao: {
          storeId: updated.pathaoStoreId,
          cityId: updated.pathaoCityId,
          zoneId: updated.pathaoZoneId,
          areaId: updated.pathaoAreaId,
        },
        contact: {
          name: updated.contactName,
          secondaryPhone: updated.secondaryContact,
          otpNumber: updated.otpNumber,
        },
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to update warehouse Pathao configuration' });
  }
});

app.get("/api/inventory", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });
  const sellerId = String(req.user.id);
  const inventory = await prisma.product.findMany({
    where: req.user.role === 'admin' ? undefined : { sellerId },
    include: {
      orderItems: {
        select: { qty: true },
      },
      seller: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(inventory.map((product) => ({
    ...serializeProduct(product),
    ordered_qty: product.orderItems.reduce((sum, item) => sum + item.qty, 0),
    available: product.stock,
  })));
});

app.get("/api/suppliers", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      supplierName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const suppliers = Array.from(new Map(
    purchaseOrders
      .filter((po) => po.supplierName.trim().length > 0)
      .map((po) => [
        po.supplierName.toLowerCase(),
        {
          id: po.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: po.supplierName,
          contact: {},
          productsSupplied: [],
          rating: undefined,
          createdAt: po.createdAt.toISOString(),
          updatedAt: po.updatedAt.toISOString(),
        },
      ]),
  ).values());

  res.json(suppliers);
});

app.post("/api/suppliers", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const { name, contact, productsSupplied } = req.body ?? {};
  const supplierName = String(name ?? '').trim();

  if (!supplierName) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }

  const supplier = {
    id: supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: supplierName,
    contact: contact && typeof contact === 'object' ? contact : {},
    productsSupplied: Array.isArray(productsSupplied) ? productsSupplied.map(String) : [],
    rating: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  res.status(201).json(supplier);
});

app.get("/api/purchaseOrders", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      lines: true,
    },
  });

  res.json(purchaseOrders.map((purchaseOrder) => ({
    id: purchaseOrder.id,
    supplierId: purchaseOrder.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    warehouseId: purchaseOrder.warehouseId,
    items: purchaseOrder.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: toPlainNumber(line.unitCost),
    })),
    status: purchaseOrder.status,
    createdAt: purchaseOrder.createdAt.toISOString(),
    updatedAt: purchaseOrder.updatedAt.toISOString(),
  })));
});

app.post("/api/purchaseOrders", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const { supplierId, warehouseId, items, status } = req.body ?? {};

  if (!warehouseId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'warehouseId and items are required' });
  }

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      warehouseId: String(warehouseId),
      supplierName: String(supplierId || 'supplier'),
      status: typeof status === 'string' ? status : 'draft',
      lines: {
        create: items.map((item: any) => ({
          productId: String(item.productId),
          quantity: Number(item.quantity ?? 0),
          unitCost: Number(item.unitCost ?? 0),
        })),
      },
    },
    include: {
      lines: true,
    },
  });

  res.status(201).json({
    id: purchaseOrder.id,
    supplierId: purchaseOrder.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    warehouseId: purchaseOrder.warehouseId,
    items: purchaseOrder.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: toPlainNumber(line.unitCost),
    })),
    status: purchaseOrder.status,
    createdAt: purchaseOrder.createdAt.toISOString(),
    updatedAt: purchaseOrder.updatedAt.toISOString(),
  });
});

app.patch("/api/purchaseOrders/:id", authenticateToken, async (req: any, res) => {
  if (!['admin', 'seller'].includes(req.user.role)) return res.status(403).json({ error: "Unauthorized" });

  const nextStatus = String(req.body?.status ?? '').trim();
  if (!nextStatus) {
    return res.status(400).json({ error: 'status is required' });
  }

  const purchaseOrder = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: { status: nextStatus },
    include: { lines: true },
  });

  res.json({
    id: purchaseOrder.id,
    supplierId: purchaseOrder.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    warehouseId: purchaseOrder.warehouseId,
    items: purchaseOrder.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: toPlainNumber(line.unitCost),
    })),
    status: purchaseOrder.status,
    createdAt: purchaseOrder.createdAt.toISOString(),
    updatedAt: purchaseOrder.updatedAt.toISOString(),
  });
});

// Inventory Alerts for Seller
app.get("/api/seller/inventory-alerts", authenticateToken, requireRole("seller"), async (req: any, res) => {
  const lowStockProducts = await prisma.product.findMany({
    where: {
      sellerId: String(req.user.id),
      stock: { lt: 5 },
    },
    include: {
      seller: {
        select: { name: true },
      },
    },
    orderBy: { stock: 'asc' },
  });
  res.json(lowStockProducts.map(serializeProduct));
});

// Reseller Markup Management
app.post("/api/reseller/markup", authenticateToken, requireRole("reseller"), async (req: any, res) => {
  const { product_id, markup_amount, reseller_sale_price } = req.body;
  const resellerId = String(req.user.id);

  try {
    const product = await prisma.product.findUnique({
      where: { id: String(product_id) },
      select: {
        id: true,
        resellerEnabled: true,
        resellerBasePrice: true,
      },
    });
    if (!product || !product.resellerEnabled) {
      return res.status(400).json({ error: "This product is not enabled for reseller sales." });
    }

    const basePrice = Number(toPlainNumber(product.resellerBasePrice ?? 0) || 0);
    const explicitSalePrice =
      reseller_sale_price === null || reseller_sale_price === "" || typeof reseller_sale_price === "undefined"
        ? null
        : Number(reseller_sale_price);
    const markupAmount =
      explicitSalePrice !== null
        ? explicitSalePrice - basePrice
        : Number(markup_amount ?? 0);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return res.status(400).json({ error: "Seller reseller base price is not configured correctly." });
    }
    if (!Number.isFinite(markupAmount) || markupAmount < 0) {
      return res.status(400).json({ error: "Reseller sale price cannot be lower than the seller base reseller price." });
    }

    await prismaDirect.resellerMarkup.upsert({
      where: {
        resellerId_productId: {
          resellerId,
          productId: String(product_id),
        },
      },
      update: {
        markupAmount,
      },
      create: {
        resellerId,
        productId: String(product_id),
        markupAmount,
      },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Markup Error:", error);
    res.status(500).json({ error: "Failed to update markup" });
  }
});

app.get("/api/reseller/my-products", authenticateToken, requireRole("reseller"), async (req: any, res) => {
  const resellerId = String(req.user.id);
  const products = await prismaDirect.resellerMarkup.findMany({
    where: { resellerId },
    include: {
      product: {
        include: {
          seller: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(products.map(serializeResellerMarkup));
});

  app.post("/api/reseller/add-product", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const { productId, markupAmount, resellerSalePrice } = req.body;
    const resellerId = String(req.user.id);

    try {
      const product = await prisma.product.findUnique({
        where: { id: String(productId) },
        select: {
          id: true,
          resellerEnabled: true,
          resellerBasePrice: true,
        },
      });
      if (!product || !product.resellerEnabled) {
        return res.status(400).json({ error: "Seller has not enabled reseller sales for this product." });
      }

      const basePrice = Number(toPlainNumber(product.resellerBasePrice ?? 0) || 0);
      const explicitSalePrice =
        resellerSalePrice === null || resellerSalePrice === "" || typeof resellerSalePrice === "undefined"
          ? null
          : Number(resellerSalePrice);
      const nextMarkup =
        explicitSalePrice !== null
          ? explicitSalePrice - basePrice
          : Number(markupAmount ?? 0);

      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        return res.status(400).json({ error: "Seller reseller price is not configured correctly." });
      }
      if (!Number.isFinite(nextMarkup) || nextMarkup < 0) {
        return res.status(400).json({ error: "Your sale price cannot be lower than the seller reseller price." });
      }

      await prismaDirect.resellerMarkup.upsert({
        where: {
          resellerId_productId: {
            resellerId,
            productId: String(productId),
          },
        },
        update: {
          markupAmount: nextMarkup,
        },
        create: {
          resellerId,
          productId: String(productId),
          markupAmount: nextMarkup,
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Add Product Error:", error);
      res.status(500).json({ error: "Failed to add product" });
    }
  });

  app.get("/api/reseller/referral-link", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const resellerId = String(req.user.id);
    const { code, clicks } = await ensureReferralCode(resellerId);
    res.json({ code, clicks, url: `${env.FRONTEND_URL}/r/${code}` });
  });

  app.get("/api/reseller/storefront-settings", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    try {
      const reseller = await prisma.user.findUnique({
        where: { id: String(req.user.id) },
        select: {
          id: true,
          name: true,
          bio: true,
          storeName: true,
          storefrontBannerUrl: true,
          storefrontHeadline: true,
          storefrontAccentColor: true,
          storefrontCustomDomain: true,
          storefrontPublished: true,
          storefrontDomainStatus: true,
          storefrontDomainVerificationToken: true,
          storefrontDomainVerifiedAt: true,
        },
      });

      if (!reseller) {
        return res.status(404).json({ error: "Reseller not found" });
      }

      const { code } = await ensureReferralCode(String(req.user.id));

      res.json({
        store_name: reseller.storeName || reseller.name || "",
        bio: reseller.bio || "",
        storefront_code: code,
        storefront_banner_url: reseller.storefrontBannerUrl || "",
        storefront_headline: reseller.storefrontHeadline || "",
        storefront_accent_color: reseller.storefrontAccentColor || "#0F766E",
        storefront_custom_domain: reseller.storefrontCustomDomain || "",
        storefront_published: Boolean(reseller.storefrontPublished ?? true),
        domain_verification: buildStorefrontDomainVerificationPayload(
          reseller.storefrontCustomDomain,
          reseller.storefrontDomainVerificationToken,
          reseller.storefrontDomainStatus,
          reseller.storefrontDomainVerifiedAt,
        ),
      });
    } catch (error) {
      logServerError("load reseller storefront settings", error, { userId: String(req.user.id) });
      res.status(500).json({ error: "Failed to load reseller storefront settings" });
    }
  });

  app.patch("/api/reseller/storefront-settings", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const parsed = storefrontSettingsSchema.safeParse({
      storefront_slug: normalizeStorefrontSlug(`r-${String(req.user.id).slice(-6)}`),
      storefront_headline: req.body?.storefront_headline,
      storefront_banner_url: req.body?.storefront_banner_url,
      storefront_accent_color: typeof req.body?.storefront_accent_color === "string" ? req.body.storefront_accent_color.trim() : "",
      storefront_custom_domain: normalizeStorefrontDomain(req.body?.storefront_custom_domain) || "",
      storefront_published: Boolean(req.body?.storefront_published),
    });

    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid reseller storefront payload" });
    }

    const userId = String(req.user.id);
    const payload = parsed.data;

    try {
      if (payload.storefront_custom_domain) {
        const conflictingDomain = await prisma.user.findFirst({
          where: {
            storefrontCustomDomain: payload.storefront_custom_domain,
            id: { not: userId },
          },
          select: { id: true },
        });

        if (conflictingDomain) {
          return res.status(409).json({ error: "This custom domain is already connected to another storefront." });
        }
      }

      const nextDomain = payload.storefront_custom_domain || null;
      const currentReseller = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          storefrontCustomDomain: true,
          storefrontDomainVerificationToken: true,
        },
      });

      const domainChanged = normalizeStorefrontDomain(currentReseller?.storefrontCustomDomain) !== normalizeStorefrontDomain(nextDomain);
      const nextToken =
        nextDomain && (domainChanged || !currentReseller?.storefrontDomainVerificationToken)
          ? generateStorefrontDomainVerificationToken()
          : currentReseller?.storefrontDomainVerificationToken ?? null;

      const updatedReseller = await prisma.user.update({
        where: { id: userId },
        data: {
          storefrontSlug: payload.storefront_slug,
          storefrontHeadline: payload.storefront_headline || null,
          storefrontBannerUrl: payload.storefront_banner_url || null,
          storefrontAccentColor: payload.storefront_accent_color || "#0F766E",
          storefrontCustomDomain: nextDomain,
          storefrontPublished: payload.storefront_published,
          storefrontDomainStatus: nextDomain ? "pending" : "unverified",
          storefrontDomainVerificationToken: nextDomain ? nextToken : null,
          storefrontDomainVerifiedAt: nextDomain ? null : null,
        },
      });

      const { code } = await ensureReferralCode(userId);

      res.json({
        success: true,
        storefront: {
          storefront_code: code,
          storefront_banner_url: updatedReseller.storefrontBannerUrl,
          storefront_headline: updatedReseller.storefrontHeadline,
          storefront_accent_color: updatedReseller.storefrontAccentColor,
          storefront_custom_domain: updatedReseller.storefrontCustomDomain,
          storefront_published: updatedReseller.storefrontPublished,
          domain_verification: buildStorefrontDomainVerificationPayload(
            updatedReseller.storefrontCustomDomain,
            updatedReseller.storefrontDomainVerificationToken,
            updatedReseller.storefrontDomainStatus,
            updatedReseller.storefrontDomainVerifiedAt,
          ),
        },
      });
    } catch (error) {
      logServerError("update reseller storefront settings", error, { userId });
      res.status(500).json({ error: "Failed to update reseller storefront settings" });
    }
  });

  app.post("/api/storefront-domain/refresh", authenticateToken, requireRole("seller", "reseller"), async (req: any, res) => {
    const userId = String(req.user.id);

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          storefrontCustomDomain: true,
        },
      });

      if (!user?.storefrontCustomDomain) {
        return res.status(400).json({ error: "Add a custom domain before refreshing the verification token." });
      }

      const nextToken = generateStorefrontDomainVerificationToken();
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          storefrontDomainStatus: "pending",
          storefrontDomainVerificationToken: nextToken,
          storefrontDomainVerifiedAt: null,
        },
      });

      res.json({
        success: true,
        domain_verification: buildStorefrontDomainVerificationPayload(
          updated.storefrontCustomDomain,
          updated.storefrontDomainVerificationToken,
          updated.storefrontDomainStatus,
          updated.storefrontDomainVerifiedAt,
        ),
      });
    } catch (error) {
      logServerError("refresh storefront domain verification", error, { userId });
      res.status(500).json({ error: "Failed to refresh storefront domain verification token" });
    }
  });

  app.post("/api/storefront-domain/verify", authenticateToken, requireRole("seller", "reseller"), async (req: any, res) => {
    const userId = String(req.user.id);

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          storefrontCustomDomain: true,
          storefrontDomainVerificationToken: true,
          storefrontDomainStatus: true,
          storefrontDomainVerifiedAt: true,
        },
      });

      if (!user?.storefrontCustomDomain || !user?.storefrontDomainVerificationToken) {
        return res.status(400).json({ error: "Add a custom domain first so LofiMart can verify it." });
      }

      const domain = normalizeStorefrontDomain(user.storefrontCustomDomain);
      const token = String(user.storefrontDomainVerificationToken);
      if (!domain) {
        return res.status(400).json({ error: "Add a valid custom domain before verification." });
      }
      const txtHost = `_amarshop-challenge.${domain}`;

      let txtMatches = false;
      let cnameMatches = false;

      try {
        const txtAnswers = await resolveTxt(txtHost);
        txtMatches = txtAnswers.some((entry) => entry.join("") === token);
      } catch {
        txtMatches = false;
      }

      try {
        const cnameAnswers = await resolveCname(domain);
        cnameMatches = cnameAnswers.some((entry) => String(entry).toLowerCase().replace(/\.$/, "") === "stores.lofimart.com");
      } catch {
        cnameMatches = false;
      }

      const verified = txtMatches && cnameMatches;

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          storefrontDomainStatus: verified ? "verified" : "pending",
          storefrontDomainVerifiedAt: verified ? new Date() : null,
        },
      });

      res.json({
        success: verified,
        checks: {
          txt_record_found: txtMatches,
          cname_record_found: cnameMatches,
        },
        domain_verification: buildStorefrontDomainVerificationPayload(
          updated.storefrontCustomDomain,
          updated.storefrontDomainVerificationToken,
          updated.storefrontDomainStatus,
          updated.storefrontDomainVerifiedAt,
        ),
      });
    } catch (error) {
      logServerError("verify storefront domain", error, { userId });
      res.status(500).json({ error: "Failed to verify storefront domain" });
    }
  });

  app.get("/api/reseller/manual-orders/catalog", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    try {
      const products = await loadManualOrderCatalogForRole("reseller", String(req.user.id));
      const categories = [...new Set(products.map((product: any) => String(product.category || "Uncategorized")))];
      const referral = await ensureReferralCode(String(req.user.id));
      res.json({ products, categories, refCode: referral.code });
    } catch (error) {
      res.status(500).json({ error: "Failed to load reseller manual order catalog" });
    }
  });

  app.get("/api/reseller/manual-orders", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    try {
      const orders = await loadRecentManualOrdersForReseller(String(req.user.id));
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: "Failed to load reseller manual orders" });
    }
  });

  app.patch("/api/reseller/manual-orders/:id", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    try {
      const order = await updateManualMarketplaceOrder({
        role: "reseller",
        userId: String(req.user.id),
        orderId: String(req.params.id),
        payload: req.body,
      });
      await createNotification({
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Manual order updated",
        message: `Manual order ${order.order_code || order.id} was updated successfully.`,
        actionUrl: `/reseller-dashboard/manual-orders`,
        metadata: { orderId: order.id, orderCode: order.order_code ?? null },
      });
      res.json(order);
    } catch (error: any) {
      const message = String(error?.message || "Failed to update manual order");
      res.status(message.includes("not found") ? 404 : 400).json({ error: message });
    }
  });

  app.post("/api/reseller/manual-orders/:id/cancel", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    try {
      const order = await cancelManualMarketplaceOrder({
        role: "reseller",
        userId: String(req.user.id),
        orderId: String(req.params.id),
      });
      await createNotification({
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Manual order cancelled",
        message: `Manual order ${order.order_code || order.id} was cancelled and stock was restored.`,
        actionUrl: `/reseller-dashboard/manual-orders`,
        metadata: { orderId: order.id, orderCode: order.order_code ?? null },
      });
      res.json(order);
    } catch (error: any) {
      const message = String(error?.message || "Failed to cancel manual order");
      res.status(message.includes("not found") ? 404 : 400).json({ error: message });
    }
  });

  app.post("/api/reseller/manual-orders", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    try {
      const referral = await ensureReferralCode(String(req.user.id));
      const order = await createManualMarketplaceOrder({
        role: "reseller",
        creator: {
          id: String(req.user.id),
          name: req.user.name ?? null,
          tenantId: req.user.tenantId ?? null,
          refCode: referral.code,
        },
        payload: req.body,
      });

      await createNotification({
        userId: String(req.user.id),
        tenantId: req.user.tenantId ?? null,
        type: "order_update",
        title: "Manual reseller order created",
        message: `Reseller order ${order.orderCode || order.id} has been created and margin tracking is active.`,
        actionUrl: `/reseller-dashboard/overview`,
        metadata: {
          orderId: order.id,
          orderCode: order.orderCode ?? null,
          manualOrder: true,
          refCode: referral.code,
        },
      });

      res.json({ success: true, orderId: order.id, orderCode: order.orderCode ?? null });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Failed to create reseller manual order" });
    }
  });

  app.post("/api/reseller/referral-link", authenticateToken, requireRole("reseller"), async (req: any, res) => {
      const resellerId = String(req.user.id);
      const codeRow = await ensureReferralCode(resellerId);
      res.json({ code: codeRow.code, url: `${env.FRONTEND_URL}/r/${codeRow.code}` });
    });

  app.get("/api/reseller/onboarding-status", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const resellerId = String(req.user.id);

    try {
      const [reseller, notificationPreference, payoutMethodCount, referral, markupsCount] = await Promise.all([
        prisma.user.findUnique({
          where: { id: resellerId },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            bio: true,
            emailVerified: true,
            phoneVerified: true,
            storefrontHeadline: true,
            storefrontCustomDomain: true,
            storefrontPublished: true,
          },
        }),
        ensureNotificationPreference(resellerId),
        prisma.payoutMethod.count({
          where: { userId: resellerId, status: 'active' },
        }),
        ensureReferralCode(resellerId),
        prisma.resellerMarkup.count({
          where: { resellerId },
        }),
      ]);

      if (!reseller) {
        return res.status(404).json({ error: "Reseller not found" });
      }

      const successfulReferrals = await prisma.order.count({
        where: { refCode: referral.code },
      });

      const hasVerifiedEmail = Boolean(reseller.emailVerified);
      const hasVerifiedPhone = Boolean(reseller.phoneVerified);
      const hasProfileBasics = Boolean(reseller.name?.trim()) && Boolean(reseller.phone?.trim());
      const hasStoreStory = Boolean(reseller.bio?.trim()) || Boolean(reseller.storefrontHeadline?.trim());
      const hasCatalog = markupsCount > 0;
      const payoutReady = payoutMethodCount > 0;
      const sharedClicks = Number(referral.clicks || 0) > 0;
      const hasFirstSaleMotion = successfulReferrals > 0;
      const storefrontPublished = Boolean(reseller.storefrontPublished);

      const steps = [
        {
          id: 'account',
          title: 'Verify account',
          description: 'Confirm your email and phone so your reseller identity and payouts stay trustworthy.',
          completed: hasVerifiedEmail && hasVerifiedPhone,
          status: hasVerifiedEmail && hasVerifiedPhone ? 'Email and phone verified' : hasVerifiedEmail ? 'Email verified, phone pending' : 'Email verification pending',
          action_path: '/reseller-dashboard/settings?section=profile',
        },
        {
          id: 'profile',
          title: 'Complete reseller profile',
          description: 'Add your phone, bio, and storefront story so people trust your curated picks.',
          completed: hasProfileBasics && hasStoreStory,
          status: hasProfileBasics ? hasStoreStory ? 'Profile ready' : 'Add a reseller bio or headline' : 'Phone and basics missing',
          action_path: '/reseller-dashboard/settings?section=profile',
        },
        {
          id: 'referral',
          title: 'Activate referral identity',
          description: 'Your referral code powers storefront links, order attribution, and earnings tracking.',
          completed: Boolean(referral.code),
          status: `Referral code ready: ${referral.code}`,
          action_path: '/reseller-dashboard/promotions',
        },
        {
          id: 'catalog',
          title: 'Add reseller products',
          description: 'Build your catalog by adding seller-approved products and setting resale prices.',
          completed: hasCatalog,
          status: hasCatalog ? `${markupsCount} products added` : 'No reseller products added',
          action_path: '/reseller-dashboard/shop',
        },
        {
          id: 'payout',
          title: 'Add payout method',
          description: 'Connect where your earnings should be paid once orders settle.',
          completed: payoutReady,
          status: payoutReady ? `${payoutMethodCount} payout method${payoutMethodCount === 1 ? '' : 's'} active` : 'No payout method added',
          action_path: '/reseller-dashboard/settings?section=payout',
        },
        {
          id: 'promotion',
          title: 'Share and promote',
          description: 'Start driving visits to your storefront and referral links.',
          completed: sharedClicks,
          status: sharedClicks ? `${referral.clicks || 0} referral clicks tracked` : 'No tracked clicks yet',
          action_path: '/reseller-dashboard/promotions',
        },
        {
          id: 'orders',
          title: 'Get your first order',
          description: 'Complete your first attributed sale or manual order to validate your reseller workflow.',
          completed: hasFirstSaleMotion,
          status: hasFirstSaleMotion ? `${successfulReferrals} successful referral order${successfulReferrals === 1 ? '' : 's'}` : 'No reseller orders yet',
          action_path: '/reseller-dashboard/manual-orders',
        },
        {
          id: 'publish',
          title: 'Publish storefront',
          description: 'Make your reseller page public when your branding and catalog are ready.',
          completed: storefrontPublished,
          status: storefrontPublished ? 'Reseller storefront is live' : 'Storefront still private',
          action_path: '/reseller-dashboard/settings',
        },
        {
          id: 'notifications',
          title: 'Review notifications',
          description: 'Keep payout, order, and security alerts on so you never miss important actions.',
          completed: Boolean(notificationPreference),
          status: Boolean(notificationPreference) ? 'Notification preferences ready' : 'Notification preferences missing',
          action_path: '/reseller-dashboard/settings?section=notifications',
        },
      ];

      const completedSteps = steps.filter((step) => step.completed).length;
      const progressPercent = Math.round((completedSteps / steps.length) * 100);
      const nextStep = steps.find((step) => !step.completed) ?? null;

      res.json({
        reseller: {
          id: reseller.id,
          name: reseller.name,
          email: reseller.email,
          phone: reseller.phone,
          referral_code: referral.code,
        },
        summary: {
          completed_steps: completedSteps,
          total_steps: steps.length,
          progress_percent: progressPercent,
          ready_for_catalog_sales: hasCatalog && Boolean(referral.code),
          ready_for_payout: payoutReady,
          ready_for_public_storefront: storefrontPublished && hasCatalog,
        },
        steps,
        next_step: nextStep,
        metrics: {
          referral_clicks: Number(referral.clicks || 0),
          products_added: markupsCount,
          payout_method_count: payoutMethodCount,
        },
      });
    } catch (error) {
      logServerError("load reseller onboarding status", error, { userId: resellerId });
      res.status(500).json({ error: "Failed to load reseller onboarding status" });
    }
  });

  app.get("/api/reseller/storefront/:code", async (req: any, res) => {
    const code = String(req.params.code || "").trim();
    if (!code) {
      return res.status(400).json({ error: "Storefront code is required." });
    }

    const referral = await prismaDirect.resellerReferral.findUnique({
      where: { code },
      include: {
        reseller: {
          select: {
            id: true,
            name: true,
            storeName: true,
            storefrontBannerUrl: true,
            storefrontHeadline: true,
            storefrontAccentColor: true,
            storefrontCustomDomain: true,
            storefrontPublished: true,
            avatarUrl: true,
            bio: true,
          },
        },
      },
    });

    if (!referral) {
      return res.status(404).json({ error: "Reseller storefront not found." });
    }

    await prismaDirect.resellerReferral.update({
      where: { code },
      data: {
        clicks: {
          increment: 1,
        },
      },
    });

    const markups = await prismaDirect.resellerMarkup.findMany({
      where: { resellerId: referral.resellerId },
      include: {
        product: {
          include: {
            seller: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const products = markups
      .filter((row) => row.product?.resellerEnabled)
      .map((row) => {
        const product = serializeProduct(row.product);
        const basePrice = Number(toPlainNumber(row.product?.resellerBasePrice ?? 0) || 0);
        const salePrice = Number((basePrice + Number(toPlainNumber(row.markupAmount) || 0)).toFixed(2));
        return {
          ...product,
          price: salePrice,
          reseller_ref_code: code,
          reseller_sale_price: salePrice,
        };
      });

    res.json({
      storefront: {
        code,
        reseller_id: referral.resellerId,
        reseller_name: referral.reseller?.name || "Reseller",
        store_name: referral.reseller?.storeName || null,
        banner_url: referral.reseller?.storefrontBannerUrl || null,
        headline: referral.reseller?.storefrontHeadline || null,
        accent_color: referral.reseller?.storefrontAccentColor || "#0F766E",
        custom_domain: referral.reseller?.storefrontCustomDomain || null,
        is_published: Boolean(referral.reseller?.storefrontPublished ?? true),
        avatar_url: referral.reseller?.avatarUrl || null,
        bio: referral.reseller?.bio || null,
      },
      categories: [...new Set(products.map((item) => String(item.category || "").trim()).filter(Boolean))],
      products,
    });
  });

  app.post("/api/reseller/payout-request", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const { amount, notes } = req.body;
    const payout = await prismaDirect.resellerPayout.create({
      data: {
        resellerId: String(req.user.id),
        amount: Number(amount ?? 0),
        status: 'pending',
        notes: notes || null,
      },
    });

    const reseller = await prisma.user.findUnique({
      where: { id: String(req.user.id) },
      select: { id: true, name: true, email: true, tenantId: true, role: true },
    });

    await createNotification({
      userId: String(req.user.id),
      tenantId: reseller?.tenantId ?? null,
      type: "payout",
      title: "Payout request submitted",
      message: `Your payout request for ${Number(amount ?? 0).toLocaleString()} BDT has been submitted for review.`,
      actionUrl: "/reseller-dashboard/earnings",
      metadata: {
        resellerPayoutId: payout.id,
        amount: Number(amount ?? 0),
        status: "pending",
      },
    });

    const admins = await getActiveAdminUsers();
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin.id,
          tenantId: reseller?.tenantId ?? null,
          createdById: String(req.user.id),
          type: "payout",
          title: "New reseller payout request",
          message: `${reseller?.name || reseller?.email || "A reseller"} requested a payout of ${Number(amount ?? 0).toLocaleString()} BDT.`,
          actionUrl: `/admin/users?search=${encodeURIComponent(reseller?.email || reseller?.name || String(req.user.id))}&user=${encodeURIComponent(String(req.user.id))}`,
          metadata: {
            resellerPayoutId: payout.id,
            resellerId: String(req.user.id),
            amount: Number(amount ?? 0),
            notes: notes || null,
          },
        }),
      ),
    );

    res.json({ success: true });
  });


  app.get("/api/reseller/payouts", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const rows = await prismaDirect.resellerPayout.findMany({
      where: { resellerId: String(req.user.id) },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(serializeResellerPayout));
  });

  app.get("/api/reseller/commissions", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const rows = await prismaDirect.resellerCommission.findMany({
      where: { resellerId: String(req.user.id) },
      include: {
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(serializeResellerCommission));
  });

    app.get("/api/reseller/stats", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const resellerId = String(req.user.id);
    const { code, clicks } = await ensureReferralCode(resellerId);
    const [commissionAgg, productsCount, referralOrders] = await Promise.all([
      prismaDirect.resellerCommission.groupBy({
        by: ['status'],
        where: { resellerId },
        _sum: { amount: true },
      }),
      prismaDirect.resellerMarkup.count({
        where: { resellerId },
      }),
      prisma.order.aggregate({
        where: { refCode: code },
        _count: { _all: true },
      }),
    ]);
    const totalEarned = commissionAgg.find((item) => item.status === 'paid')?._sum.amount ?? 0;
    const pending = commissionAgg.find((item) => item.status === 'pending')?._sum.amount ?? 0;
    const successful = referralOrders._count._all || 0;
    const conversionRate = clicks ? `${Math.round((successful / clicks) * 100)}%` : "0%";
    res.json({
      totalEarnings: toPlainNumber(totalEarned),
      pendingEarnings: toPlainNumber(pending),
      productsShared: productsCount || 0,
      successfulReferrals: successful,
      conversionRate,
      referralClicks: clicks || 0,
      referralCode: code
    });
  });
  app.get("/api/reseller/network", authenticateToken, requireRole("reseller"), async (req: any, res) => {
    const resellerId = String(req.user.id);
    const { code } = await ensureReferralCode(resellerId);
    const orders = await prisma.order.findMany({
      where: { refCode: code },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true } },
      },
    });
    const directReferrals = orders.length;
    const today = new Date().toISOString().slice(0, 10);
    const networkSales = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const activeToday = orders.filter(o => o.createdAt.toISOString().slice(0,10) === today).length;
    const commissions = await prismaDirect.resellerCommission.findMany({
      where: {
        resellerId,
        orderId: { in: orders.map((order) => order.id) },
      },
      select: {
        orderId: true,
        amount: true,
        status: true,
      },
    });
    const commissionEntries: Array<readonly [string, { amount: Prisma.Decimal; status: string }]> = commissions.flatMap(
      (item) => (item.orderId ? [[item.orderId, { amount: item.amount, status: item.status }] as const] : []),
    );
    const commissionMap = new Map(commissionEntries);
    const downline = orders.map((o) => {
      const commissionRow = commissionMap.get(o.id);
      return {
        id: o.id,
        name: o.user?.name || `Customer #${o.userId}`,
        joined: o.createdAt.toISOString(),
        level: 1,
        sales: toPlainNumber(o.total || 0),
        commission: toPlainNumber(commissionRow?.amount || 0),
        status: commissionRow?.status === 'paid' ? 'Active' : 'Pending'
      };
    });

    res.json({
      directReferrals,
      networkSize: directReferrals,
      networkSales,
      activeToday,
      downline
    });
  });
  app.get("/api/reseller/earnings", authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'reseller') return res.sendStatus(403);
    const resellerId = String(req.user.id);
    const [totals, nextPayout, transactions] = await Promise.all([
      prismaDirect.resellerCommission.groupBy({
        by: ['status'],
        where: { resellerId },
        _sum: { amount: true },
      }),
      prismaDirect.resellerPayout.aggregate({
        where: {
          resellerId,
          status: 'pending',
        },
        _sum: { amount: true },
      }),
      prismaDirect.resellerCommission.findMany({
        where: { resellerId },
        include: {
          product: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const getTotal = (status: string) => totals.find(t => t.status === status)?._sum.amount || 0;
    const available = getTotal('paid');
    const pending = getTotal('pending');

    res.json({
      availableBalance: toPlainNumber(available),
      totalEarned: toPlainNumber(Number(available) + Number(pending)),
      pendingAmount: toPlainNumber(pending),
      nextPayout: toPlainNumber(nextPayout._sum.amount ?? 0),
      commissions: transactions.map(serializeResellerCommission)
    });
  });
// ============ AI RECOMMENDATION ENDPOINTS ============

  // Track user interactions
  app.post("/api/ai/interactions", async (req, res) => {
    const { product_id, interaction_type, session_id, device_type, userId } = req.body;
    
    try {
      await prismaDirect.userInteraction.create({
        data: {
          userId: userId ? String(userId) : null,
          productId: String(product_id),
          interactionType: String(interaction_type),
          sessionId: session_id || 'unknown',
          deviceType: device_type || 'web',
        },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error tracking interaction:', error);
      res.status(500).json({ error: 'Failed to track interaction' });
    }
  });

  // Personalized recommendations based on user history
  app.get("/api/ai/recommendations/personalized", async (req, res) => {
    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 8, 20);

    try {
      let recommendations: any[] = [];

      if (userId && userId !== 'anonymous') {
        // Get user's browsing history
        const userInteractions = await prismaDirect.userInteraction.findMany({
          where: {
            userId,
            interactionType: { in: ['view', 'click'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            product: {
              select: { category: true },
            },
          },
        });

        const categories = [...new Set(userInteractions.map((item) => item.product.category).filter(Boolean))];
        const seenProductIds = [...new Set(userInteractions.map((item) => item.productId))];

        if (categories.length > 0) {
          recommendations = await prisma.product.findMany({
            where: {
              category: { in: categories as string[] },
              id: { notIn: seenProductIds },
            },
            orderBy: [
              { rating: 'desc' },
              { reviewsCount: 'desc' },
            ],
            take: limit,
            include: {
              seller: {
                select: { name: true },
              },
            },
          });
        }

        if (recommendations.length < limit) {
          const fallback = await prisma.product.findMany({
            orderBy: [
              { rating: 'desc' },
              { reviewsCount: 'desc' },
              { createdAt: 'desc' },
            ],
            take: limit,
            include: {
              seller: {
                select: { name: true },
              },
            },
          });
          
          recommendations = [...recommendations, ...fallback].slice(0, limit);
        }
      } else {
        recommendations = await prisma.product.findMany({
          orderBy: [
            { rating: 'desc' },
            { reviewsCount: 'desc' },
            { createdAt: 'desc' },
          ],
          take: limit,
          include: {
            seller: {
              select: { name: true },
            },
          },
        });
      }

      res.json(recommendations.map(serializeProduct));
    } catch (error) {
      console.error('Error fetching personalized recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  // Trending products
  app.get("/api/ai/recommendations/trending", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 8, 20);

    try {
      const products = await prisma.product.findMany({
        orderBy: [
          { rating: 'desc' },
          { reviewsCount: 'desc' },
          { createdAt: 'desc' },
        ],
        take: limit,
        include: {
          seller: {
            select: { name: true },
          },
        },
      });

      res.json(products.map(serializeProduct));
    } catch (error) {
      console.error('Error fetching trending products:', error);
      res.status(500).json({ error: 'Failed to fetch trending products' });
    }
  });

  // Context-based recommendations (because you viewed X)
  app.get("/api/ai/recommendations/context", async (req, res) => {
    const productId = String(req.query.productId ?? '');
    const limit = Math.min(parseInt(req.query.limit as string) || 4, 10);

    try {
      const currentProduct = await prisma.product.findUnique({
        where: { id: productId },
        select: { category: true },
      });

      if (!currentProduct) {
        return res.json([]);
      }

      const recommendations = await prisma.product.findMany({
        where: {
          category: currentProduct.category,
          id: { not: productId },
        },
        orderBy: [
          { rating: 'desc' },
          { reviewsCount: 'desc' },
        ],
        take: limit,
        include: {
          seller: {
            select: { name: true },
          },
        },
      });

      res.json(recommendations.map(serializeProduct));
    } catch (error) {
      console.error('Error fetching context recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  // Collaborative filtering recommendations (customers also bought)
  app.get("/api/ai/recommendations/collaborative", async (req, res) => {
    const productId = String(req.query.productId ?? '');
    const limit = Math.min(parseInt(req.query.limit as string) || 4, 10);

    try {
      const orderItems = await prisma.orderItem.findMany({
        where: { productId },
        select: { orderId: true },
        take: 50,
      });
      const orderIds = orderItems.map((item) => item.orderId);
      if (orderIds.length === 0) {
        return res.json([]);
      }

      const relatedItems = await prisma.orderItem.findMany({
        where: {
          orderId: { in: orderIds },
          productId: { not: productId },
        },
        include: {
          product: {
            include: {
              seller: { select: { name: true } },
            },
          },
        },
      });

      const ranked = new Map<string, { frequency: number; product: any }>();
      for (const item of relatedItems) {
        const current = ranked.get(item.productId);
        ranked.set(item.productId, {
          frequency: (current?.frequency ?? 0) + 1,
          product: item.product,
        });
      }

      res.json(
        [...ranked.values()]
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, limit)
          .map((entry) => serializeProduct(entry.product))
      );
    } catch (error) {
      console.error('Error fetching collaborative recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  // Category-specific recommendations
  app.get("/api/ai/recommendations/category/:categoryId", async (req, res) => {
    const categoryId = req.params.categoryId;
    const limit = Math.min(parseInt(req.query.limit as string) || 8, 20);

    try {
      const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { name: true },
      });
      if (!category) {
        return res.json([]);
      }
      const products = await prisma.product.findMany({
        where: { category: category.name },
        orderBy: [
          { rating: 'desc' },
          { reviewsCount: 'desc' },
        ],
        take: limit,
        include: {
          seller: {
            select: { name: true },
          },
        },
      });

      res.json(products.map(serializeProduct));
    } catch (error) {
      console.error('Error fetching category recommendations:', error);
      res.status(500).json({ error: 'Failed to fetch category recommendations' });
    }
  });

  // Track recommendation click-through and conversions
  app.post("/api/ai/recommendations/track", async (req, res) => {
    const { recommendation_id, user_id, product_id, position, clicked, converted } = req.body;

    try {
      await prismaDirect.recommendationAnalytic.create({
        data: {
          recommendationId: String(recommendation_id),
          userId: user_id ? String(user_id) : null,
          productId: String(product_id),
          position: position === undefined ? null : Number(position),
          clicked: Boolean(clicked),
          converted: Boolean(converted),
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error tracking recommendation:', error);
      res.status(500).json({ error: 'Failed to track recommendation' });
    }
  });

  // Get recommendation analytics
  app.get("/api/ai/recommendations/analytics", async (req: any, res) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'seller') {
      return res.sendStatus(403);
    }

    try {
      const rows = await prismaDirect.recommendationAnalytic.groupBy({
        by: ['productId'],
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _count: { _all: true },
      });

      const analytics = await Promise.all(rows.map(async (row) => {
        const events = await prismaDirect.recommendationAnalytic.findMany({
          where: { productId: row.productId },
          select: { clicked: true, converted: true },
        });
        const clicks = events.filter((event) => event.clicked).length;
        const conversions = events.filter((event) => event.converted).length;
        return {
          product_id: row.productId,
          total_impressions: row._count._all,
          clicks,
          conversions,
          ctr: row._count._all ? Number(((clicks / row._count._all) * 100).toFixed(2)) : 0,
          conversion_rate: clicks ? Number(((conversions / clicks) * 100).toFixed(2)) : 0,
        };
      }));

      res.json(analytics);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  app.post("/api/analytics/web-vitals", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      const value = Number(req.body?.value);
      const route = typeof req.body?.route === "string" ? req.body.route : "";

      if (!name || !Number.isFinite(value) || !route) {
        return res.status(400).json({ error: "Invalid analytics payload" });
      }

      const payload = {
        name: `web-vital:${name}`,
        value,
        id: req.body?.id ?? null,
        rating: typeof req.body?.rating === "string" ? req.body.rating : null,
        route,
        url: typeof req.body?.url === "string" ? req.body.url : null,
        referrer: typeof req.body?.referrer === "string" ? req.body.referrer : null,
        userAgent: typeof req.body?.userAgent === "string" ? req.body.userAgent : null,
        ts: Number(req.body?.ts) || Date.now(),
      };

      let redisForAlerts: Awaited<ReturnType<typeof ensureRedis>> | null = null;

      try {
        redisForAlerts = await ensureRedis();
        await redisForAlerts
          .multi()
          .lpush(PERFORMANCE_EVENTS_KEY, JSON.stringify(payload))
          .ltrim(PERFORMANCE_EVENTS_KEY, 0, 499)
          .expire(PERFORMANCE_EVENTS_KEY, 60 * 60 * 24 * 7)
          .exec();
      } catch {}

      await enqueueAnalyticsEvent({
        name: payload.name,
        payload,
      });

      if (payload.rating === "poor" && redisForAlerts) {
        try {
          const hasCooldown = await redisForAlerts.get(PERFORMANCE_ALERT_COOLDOWN_KEY);

          if (!hasCooldown) {
            const recentRawEvents = await redisForAlerts.lrange(PERFORMANCE_EVENTS_KEY, 0, 149);
            const parsedEvents = recentRawEvents
              .map((entry) => {
                try {
                  return JSON.parse(entry);
                } catch {
                  return null;
                }
              })
              .filter(Boolean);

            const burst = isCriticalPerformanceBurst(parsedEvents, payload.route, payload.ts);

            if (burst.triggered) {
              const admins = await prisma.user.findMany({
                where: {
                  role: "admin",
                  isBlocked: false,
                  deactivatedAt: null,
                },
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              });

              if (admins.length > 0) {
                const alertTitle = "Critical storefront performance alert";
                const alertMessage =
                  `Poor web vitals spiked in the last 10 minutes. ` +
                  `${burst.recentPoorCount} poor samples were recorded, including ${burst.routePoorCount} on ${payload.route}.`;

                await Promise.all(admins.map(async (admin) => {
                  await createNotification({
                    userId: admin.id,
                    type: "performance_alert",
                    title: alertTitle,
                    message: alertMessage,
                    actionUrl: "/admin/performance",
                    metadata: {
                      route: payload.route,
                      metric: name,
                      poorSamples: burst.recentPoorCount,
                      routePoorSamples: burst.routePoorCount,
                      windowMinutes: 10,
                    },
                  });

                  if (admin.email) {
                    await enqueueEmail({
                      to: admin.email,
                      subject: "Critical performance alert detected on LofiMart",
                      template: "performance-alert",
                      payload: {
                        message: alertMessage,
                        html: `
                          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
                            <h2 style="margin-bottom:12px;">Critical performance alert</h2>
                            <p>Hello ${String(admin.name || "Admin")},</p>
                            <p>${alertMessage}</p>
                            <p><strong>Latest metric:</strong> ${name}</p>
                            <p><strong>Route:</strong> ${payload.route}</p>
                            <p><strong>Captured value:</strong> ${value}</p>
                            <p>Review the performance dashboard to investigate the affected route trends.</p>
                          </div>
                        `,
                      },
                    });
                  }
                }));

                await redisForAlerts
                  .multi()
                  .lpush(
                    PERFORMANCE_ALERTS_KEY,
                    JSON.stringify({
                      route: payload.route,
                      metric: name,
                      ts: payload.ts,
                      poorSamples: burst.recentPoorCount,
                      routePoorSamples: burst.routePoorCount,
                      value,
                    }),
                  )
                  .ltrim(PERFORMANCE_ALERTS_KEY, 0, 49)
                  .expire(PERFORMANCE_ALERTS_KEY, 60 * 60 * 24 * 14)
                  .set(
                    PERFORMANCE_ALERT_COOLDOWN_KEY,
                    JSON.stringify({
                      route: payload.route,
                      metric: name,
                      ts: payload.ts,
                      poorSamples: burst.recentPoorCount,
                      routePoorSamples: burst.routePoorCount,
                    }),
                    "EX",
                    PERFORMANCE_ALERT_COOLDOWN_SECONDS,
                  )
                  .exec();

              }
            }
          }
        } catch {}
      }

      res.json({ success: true });
    } catch {
      res.status(202).json({ accepted: true });
    }
  });

  // ============ VISUAL SEARCH ENDPOINTS ============

  // Visual search upload and process
  app.post("/api/ai/visual-search/upload", async (req, res) => {
    const { image, filters } = req.body;

    try {
      // In a real implementation, you would:
      // 1. Save the image
      // 2. Extract features using Google Vision API or TensorFlow
      // 3. Compare with product image embeddings
      // 4. Return similar products

      // For now, we'll simulate with a basic category-based search
      let results = await prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        take: 24,
        include: {
          seller: {
            select: { name: true },
          },
        },
      });

      // Apply filters
      if (filters?.category) {
        results = results.filter(p => p.category === filters.category);
      }

      if (filters?.priceRange && filters.priceRange !== 'all') {
        results = results.filter(p => {
          const price = Number(p.price);
          switch (filters.priceRange) {
            case '0-500':
              return price <= 500;
            case '500-2000':
              return price > 500 && price <= 2000;
            case '2000-10000':
              return price > 2000 && price <= 10000;
            case '10000+':
              return price > 10000;
            default:
              return true;
          }
        });
      }

      // Add confidence scores (simulated)
      const resultsWithConfidence = results.map((product, index) => ({
        ...serializeProduct(product),
        confidence: 0.95 - index * 0.05 // Decreasing confidence
      }));

      res.json({
        success: true,
        results: resultsWithConfidence,
        count: resultsWithConfidence.length
      });
    } catch (error) {
      console.error('Visual search error:', error);
      res.status(500).json({ error: 'Visual search failed' });
    }
  });

  // ============ AI PRICING OPTIMIZATION ENDPOINTS ============

  // Get price suggestions for a product
  app.get("/api/ai/pricing/suggestions/:productId", async (req, res) => {
    const productId = req.params.productId;

    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Get price history
      const history = await prismaDirect.priceHistory.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });

      // Get competitor prices (simulated)
      const competitorPrices = [
        Number(product.price) - 200,
        Number(product.price) - 100,
        Number(product.price),
        Number(product.price) + 100,
        Number(product.price) + 200
      ];
      const competitorAvg = competitorPrices.reduce((a, b) => a + b) / competitorPrices.length;

      // Calculate demand score (0-1) based on views and purchases
      const [interactions, reviews] = await Promise.all([
        prismaDirect.userInteraction.count({
          where: { productId, interactionType: 'view' },
        }),
        prisma.review.aggregate({
          where: { productId },
          _avg: { rating: true },
        }),
      ]);

      const demandScore = Math.min(interactions / 100, 1); // Normalize

      // Price elasticity (simplified model)
      // Inelastic (< 1): luxury/essential goods
      // Elastic (> 1): discretionary goods
      const elasticity = product.category === 'Electronics' ? 1.3 : 0.9;

      // Calculate optimal price using simple model
      const margin = 0.2; // Target 20% margin
      const costPrice = Number(product.price) * (1 - margin);
      const priceRangeMin = costPrice * 1.1;
      const priceRangeMax = competitorAvg * 1.2;
      const suggestedPrice = (priceRangeMin + priceRangeMax) / 2;

      // Confidence score based on data availability
      const confidenceScore = Math.min((history.length / 30) * 0.5 + 0.5, 0.99);

      const suggestion = {
        product_id: productId,
        suggested_price: Math.round(suggestedPrice),
        min_price: Math.round(priceRangeMin),
        max_price: Math.round(priceRangeMax),
        confidence_score: confidenceScore,
        reasons: [
          `Market competitive pricing at ৳${Math.round(competitorAvg)}`,
          `Strong demand indicators (${interactions} recent views)`,
          `Optimal margin considering elasticity of ${elasticity}`,
          reviews._avg.rating ? `Rating ${reviews._avg.rating.toFixed(1)}/5 supports premium pricing` : 'New product'
        ],
        demand_score: demandScore,
        current_price: Number(product.price),
        competitor_avg: Math.round(competitorAvg),
        elasticity: elasticity
      };

      // Format history for chart
      const chartHistory = history.map((h: any, idx) => ({
        date: new Date(h.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: toPlainNumber(h.price),
        competitor_prices: h.competitorPrices || competitorAvg,
        demand_score: h.demandScore || 0,
        conversion_rate: h.conversionRate || 0
      })).reverse();

      res.json({
        suggestion,
        history: chartHistory,
        appliedPrice: null
      });
    } catch (error) {
      console.error('Error fetching pricing suggestion:', error);
      res.status(500).json({ error: 'Failed to fetch pricing suggestion' });
    }
  });

  // Apply suggested price
  app.post("/api/ai/pricing/apply", authenticateToken, async (req: any, res) => {
    const { product_id, suggested_price } = req.body;

    try {
      // Verify seller owns this product
      const product = await prisma.product.findUnique({
        where: { id: String(product_id) },
        select: { sellerId: true },
      });
      
      if (product?.sellerId !== String(req.user.id)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      await prisma.product.update({
        where: { id: String(product_id) },
        data: { price: Number(suggested_price) },
      });

      await prismaDirect.priceHistory.create({
        data: {
          productId: String(product_id),
          price: Number(suggested_price),
          demandScore: 0.5,
        },
      });

      await prismaDirect.pricingSuggestion.create({
        data: {
          productId: String(product_id),
          suggestedPrice: Number(suggested_price),
          applied: true,
        },
      });

      await invalidatePricingCache(String(product_id));
      await invalidateProductCache(String(product_id));

      res.json({ success: true, new_price: suggested_price });
    } catch (error) {
      console.error('Error applying price:', error);
      res.status(500).json({ error: 'Failed to apply price' });
    }
  });

  // Get competitor price comparison
  app.get("/api/ai/pricing/competitor-prices/:productId", async (req, res) => {
    const productId = req.params.productId;

    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, category: true, price: true },
      });
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Get similar products (simulated competitors)
      const competitors = await prisma.product.findMany({
        where: {
          category: product.category,
          id: { not: productId },
        },
        orderBy: { rating: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          price: true,
        },
      });

      const competitorPrices = competitors.map((item) => Number(item.price));
      const marketAvg = competitorPrices.length
        ? competitorPrices.reduce((sum, price) => sum + price, 0) / competitorPrices.length
        : Number(product.price);

      res.json({
        your_price: Number(product.price),
        market_avg: marketAvg,
        min_market_price: competitorPrices.length ? Math.min(...competitorPrices) : Number(product.price),
        max_market_price: competitorPrices.length ? Math.max(...competitorPrices) : Number(product.price),
        competitors
      });
    } catch (error) {
      console.error('Error fetching competitor prices:', error);
      res.status(500).json({ error: 'Failed to fetch competitor prices' });
    }
  });

  // Get demand forecast
  app.get("/api/ai/pricing/demand-forecast/:productId", (req, res) => {
    const productId = req.params.productId;

    try {
      // Simulate demand forecast based on historical data
      const forecast = [
        { period: 'Week 1', forecast: 120, confidence: 0.95 },
        { period: 'Week 2', forecast: 130, confidence: 0.92 },
        { period: 'Week 3', forecast: 125, confidence: 0.85 },
        { period: 'Week 4', forecast: 140, confidence: 0.80 }
      ];

      res.json(forecast);
    } catch (error) {
      console.error('Error fetching demand forecast:', error);
      res.status(500).json({ error: 'Failed to fetch demand forecast' });
    }
  });

  app.all("*", async (req, res) => {
    if (!req.path.startsWith("/api")) {
      const hostMatch = await resolveStorefrontByCustomDomain(String(req.headers.host || ""));
      if (hostMatch && (req.path === "/" || req.path === "")) {
        req.url = hostMatch.targetPath;
      }
    }

    return handleNextRequest(req, res);
  });

  httpServerRef = app.listen(PORT, "0.0.0.0", () => {
    logger.info("server.http.started", {
      host: "0.0.0.0",
      port: PORT,
      environment: env.APP_ENV,
    });
    if (PORT !== preferredPort) {
      console.warn(`Port ${preferredPort} was busy; switched to ${PORT}`);
    }
  });

  // WebSocket server for realtime inventory
  const wss = new WebSocketServer({ 
    port: wsPort
  });
  wsServerRef = wss;
  const broadcast = (msg: any) => {
    const payload = JSON.stringify(msg);
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === 1) client.send(payload);
    });
  };
  logger.info("server.websocket.started", {
    port: wsPort,
    environment: env.APP_ENV,
  });
  if (wsPort !== preferredWsPort) {
    console.warn(`WebSocket port ${preferredWsPort} was busy; switched to ${wsPort}`);
  }

  const emitStockUpdate = (productId: number, stock: number) => {
    broadcast({ type: "stock", productId, stock });
  };

  const sendEmail = async (to: string, subject: string, html: string) => {
    if (mailer) {
      try {
        await mailer.sendMail({ from: mailFrom, to, subject, html });
        return;
      } catch (err) {
        console.error("Email send error", err);
      }
    }

    if (!resendApiKey) return;

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error("Resend send error", response.status, body);
      }
    } catch (err) {
      console.error("Email send error", err);
    }
  };

  registerSellerRoutes({
    app,
    env,
    prisma,
    prismaDirect,
    stripe: stripe ?? null,
    supabaseAuth,
    supabaseAdmin,
    cloudinary: cloudinary ?? null,
    mailer: mailer ?? null,
    mailFrom: mailFrom ?? "",
    resendApiKey: resendApiKey ?? "",
    webpush: webpush ?? null,
    authenticateToken,
    requireRole,
    signAccessToken,
    ensureReferralCode,
    getResellerIdFromOrderRefCode,
    settleResellerCommissionsForOrder,
    syncResellerSettlementFromShipmentStatus,
    sendEmail,
    broadcast: () => {},
    emitStockUpdate,
    recordReferralClick: async () => null,
    handleAuditLog,
    getActiveAdminUsers,
    getSettingsPathForRole,
    ensureNotificationPreference,
    markLoginActivitiesRevoked,
    reverseResellerCommissionsForOrder,
    awardSignupBonus,
    ensureLocalSupabaseUser,
    normalizePublicRole,
    resolveAuthRole,
    extractSupabaseAvatarUrl,
    getRequestIp,
    getRequestLocation,
    getSessionMetadataFromRequest,
    serializeUser,
    hashPassword,
    validateEmail,
    validatePassword,
    logServerError,
    isDatabaseUnavailableError,
    ensureEngagementBootstrap,
    generateUniqueOrderCode,
    validateCouponForCart,
    userCartKey,
    loadManualOrderCatalogForRole,
    createManualMarketplaceOrder,
    updateManualMarketplaceOrder,
    cancelManualMarketplaceOrder,
  });

  const recordReferralClick = async (code?: string) => {
    if (!code) return null;
    const ref = await prismaDirect.resellerReferral.findUnique({
      where: { code },
      select: { id: true, resellerId: true, clicks: true },
    });
    if (ref) {
      await prismaDirect.resellerReferral.update({
        where: { id: ref.id },
        data: {
          clicks: { increment: 1 },
        },
      });
      return ref.resellerId;
    }
    return null;
  };
}

startServer().catch((error) => {
  logger.error("server.start_failed", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  console.error("Server failed to start", error);
  process.exit(1);
});







