-- LOFIMART FRESH DATABASE RESET
-- DESTRUCTIVE: run ONLY against the dedicated LofiMart Supabase database.
-- This removes all public tables, indexes, foreign keys, enums and data.
DROP SCHEMA IF EXISTS "public" CASCADE;
CREATE SCHEMA "public";

CREATE TYPE "UserRole" AS ENUM ('customer', 'seller', 'reseller', 'admin');
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled', 'shipped');
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'unpaid');
CREATE TYPE "ShipmentStatus" AS ENUM ('pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled', 'shipped');
CREATE TYPE "SocialPlatform" AS ENUM ('facebook');
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR');
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "SocialAutomationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "SocialAutomationRunStatus" AS ENUM ('PENDING', 'CLAIMED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "supabaseAuthId" TEXT,
  "name" TEXT,
  "phone" TEXT,
  "alternatePhone" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'customer',
  "sellerStatus" TEXT NOT NULL DEFAULT 'draft',
  "submittedForReviewAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "rejectionReason" TEXT,
  "suspensionReason" TEXT,
  "avatarUrl" TEXT,
  "bio" TEXT,
  "storeName" TEXT,
  "storefrontSlug" TEXT,
  "storefrontBannerUrl" TEXT,
  "storefrontHeadline" TEXT,
  "storefrontAccentColor" TEXT,
  "storefrontCustomDomain" TEXT,
  "storefrontPublished" BOOLEAN NOT NULL DEFAULT true,
  "storefrontDomainStatus" TEXT DEFAULT 'unverified',
  "storefrontDomainVerificationToken" TEXT,
  "storefrontDomainVerifiedAt" TIMESTAMP(3),
  "profileVisibility" TEXT NOT NULL DEFAULT 'private',
  "responseTimeHours" INTEGER,
  "telegramChatId" TEXT,
  "telegramLinkedAt" TIMESTAMP(3),
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
  "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  "phoneVerifiedAt" TIMESTAMP(3),
  "isBlocked" BOOLEAN NOT NULL DEFAULT false,
  "blockedAt" TIMESTAMP(3),
  "blockedReason" TEXT,
  "deactivatedAt" TIMESTAMP(3),
  "points" INTEGER NOT NULL DEFAULT 0,
  "walletBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "emailVerifiedAt" TIMESTAMP(3),
  "tenantId" TEXT,
  "refCode" TEXT,
  "referral" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "sku" TEXT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "specifications" JSONB,
  "price" DECIMAL(65,30) NOT NULL,
  "oldPrice" DECIMAL(65,30),
  "weightKg" DOUBLE PRECISION,
  "image" TEXT,
  "galleryImages" JSONB,
  "videoUrl" TEXT,
  "model3d" TEXT,
  "category" TEXT,
  "variantOptions" JSONB,
  "resellerEnabled" BOOLEAN NOT NULL DEFAULT false,
  "resellerBasePrice" DECIMAL(65,30),
  "resellerSuggestedPrice" DECIMAL(65,30),
  "resellerNotes" TEXT,
  "productStatus" TEXT NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMP(3),
  "stock" INTEGER NOT NULL DEFAULT 0,
  "tenantId" TEXT,
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "reviewsCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sellerId" TEXT,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Order" (
  "id" TEXT NOT NULL,
  "orderCode" TEXT,
  "userId" TEXT,
  "guestEmail" TEXT,
  "guestPhone" TEXT,
  "claimedAt" TIMESTAMP(3),
  "tenantId" TEXT,
  "total" DECIMAL(65,30) NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'processing',
  "courierProvider" TEXT,
  "trackingId" TEXT,
  "paymentMethod" TEXT,
  "paymentProvider" TEXT,
  "paymentStatus" "PaymentStatus",
  "paidAt" TIMESTAMP(3),
  "pickupRequestedAt" TIMESTAMP(3),
  "pickedUpAt" TIMESTAMP(3),
  "outForDeliveryAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "deliveryFailureReason" TEXT,
  "refCode" TEXT,
  "shippingAddress" JSONB,
  "shipmentMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "price" DECIMAL(65,30) NOT NULL,
  "variantSummary" TEXT,
  "variantSku" TEXT,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderShipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "status" "ShipmentStatus" NOT NULL DEFAULT 'processing',
  "total" DECIMAL(65,30) NOT NULL,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "courierProvider" TEXT,
  "trackingId" TEXT,
  "pickupRequestedAt" TIMESTAMP(3),
  "pickedUpAt" TIMESTAMP(3),
  "outForDeliveryAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "deliveryFailureReason" TEXT,
  "shipmentMetadata" JSONB,
  "merchantReference" TEXT,
  "providerReference" TEXT,
  "providerStatus" TEXT,
  "customerDeliveryFee" DECIMAL(65,30),
  "courierCharge" DECIMAL(65,30),
  "codAmount" DECIMAL(65,30),
  "codFee" DECIMAL(65,30),
  "deliveryFeeVerified" BOOLEAN NOT NULL DEFAULT false,
  "bookingState" TEXT NOT NULL DEFAULT 'pending',
  "bookingAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastBookingError" TEXT,
  "lastBookingErrorCode" TEXT,
  "lastBookedAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "nextReconcileAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderShipment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ShipmentEvent" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "provider" TEXT,
  "externalStatus" TEXT,
  "internalStatus" TEXT,
  "eventId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "metadata" JSONB,
  CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CourierBookingAttempt" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "merchantReference" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "success" BOOLEAN NOT NULL DEFAULT false,
  "outcome" TEXT NOT NULL DEFAULT 'in_progress',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "httpStatus" INTEGER,
  "requestId" TEXT,
  CONSTRAINT "CourierBookingAttempt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "externalShipmentId" TEXT,
  "deliveryCount" INTEGER NOT NULL DEFAULT 1,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "outcome" TEXT NOT NULL DEFAULT 'received',
  "errorMessage" TEXT,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CourierStoreMapping" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "externalStoreId" TEXT NOT NULL,
  "externalStoreName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "cityId" INTEGER,
  "zoneId" INTEGER,
  "areaId" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourierStoreMapping_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderShipmentItem" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "price" DECIMAL(65,30) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderShipmentItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tenantId" TEXT,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT,
  "country" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "contactName" TEXT,
  "secondaryContact" TEXT,
  "otpNumber" TEXT,
  "pathaoStoreId" INTEGER,
  "pathaoCityId" INTEGER,
  "pathaoZoneId" INTEGER,
  "pathaoAreaId" INTEGER,
  "insideDhakaFee" DECIMAL(65,30),
  "outsideDhakaFee" DECIMAL(65,30),
  "insideDhakaEta" TEXT,
  "outsideDhakaEta" TEXT,
  "freeShippingThresholdOverride" DECIMAL(65,30),
  "maxItems" INTEGER,
  "maxWeightKg" DOUBLE PRECISION,
  "managerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryItem" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER NOT NULL DEFAULT 5,
  "restockThreshold" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Store" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "domain" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "locale" TEXT NOT NULL DEFAULT 'en',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Subcategory" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Subsubcategory" (
  "id" TEXT NOT NULL,
  "subcategoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Subsubcategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "quantityDelta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StockReservation" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "orderId" TEXT,
  "quantity" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "supplierName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PaymentTransaction" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "orderId" TEXT,
  "customerId" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "providerRefundId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Review" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WishlistItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Address" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT,
  "type" TEXT NOT NULL DEFAULT 'shipping',
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "alternatePhone" TEXT,
  "address" TEXT NOT NULL,
  "line2" TEXT,
  "division" TEXT,
  "district" TEXT,
  "upazila" TEXT,
  "house" TEXT,
  "road" TEXT,
  "village" TEXT,
  "city" TEXT NOT NULL,
  "state" TEXT,
  "postalCode" TEXT,
  "country" TEXT NOT NULL DEFAULT 'Bangladesh',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "sellerId" TEXT,
  "discountType" TEXT NOT NULL,
  "discountValue" DECIMAL(65,30) NOT NULL,
  "minOrderValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BlogPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT,
  "category" TEXT,
  "content" TEXT NOT NULL,
  "image" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContactMessage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unread',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Banner" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "image" TEXT NOT NULL,
  "link" TEXT NOT NULL,
  "buttonText" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlatformSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "SocialAccount" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL DEFAULT 'facebook',
  "accountId" TEXT,
  "accountName" TEXT,
  "encryptedAccessToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "status" "SocialAccountStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialAutomationSetting" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL DEFAULT 'facebook',
  "language" TEXT NOT NULL DEFAULT 'Bangla + English',
  "tone" TEXT NOT NULL DEFAULT 'Friendly',
  "captionLength" TEXT NOT NULL DEFAULT 'Medium',
  "hashtags" TEXT NOT NULL DEFAULT 'Automatic',
  "ctaEnabled" BOOLEAN NOT NULL DEFAULT true,
  "aiCaptionEnabled" BOOLEAN NOT NULL DEFAULT true,
  "defaultIntervalDays" INTEGER NOT NULL DEFAULT 3,
  "defaultPostingTime" TEXT NOT NULL DEFAULT '20:00',
  "defaultDurationMode" TEXT NOT NULL DEFAULT 'forever',
  "defaultMaxPosts" INTEGER,
  "defaultEndAt" TIMESTAMP(3),
  "generateNewCaptionEveryTime" BOOLEAN NOT NULL DEFAULT true,
  "useLatestProductData" BOOLEAN NOT NULL DEFAULT true,
  "skipOutOfStock" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialAutomationSetting_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialPost" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "automationId" TEXT,
  "platform" "SocialPlatform" NOT NULL DEFAULT 'facebook',
  "caption" TEXT,
  "mediaUrl" TEXT,
  "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "externalPostId" TEXT,
  "errorMessage" TEXT,
  "idempotencyKey" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialPostTarget" (
  "id" TEXT NOT NULL,
  "socialPostId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL DEFAULT 'facebook',
  "status" "SocialPostStatus" NOT NULL DEFAULT 'DRAFT',
  "externalPostId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPostTarget_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialPostAutomation" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL DEFAULT 'facebook',
  "intervalDays" INTEGER NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "maxPosts" INTEGER,
  "postsCreated" INTEGER NOT NULL DEFAULT 0,
  "status" "SocialAutomationStatus" NOT NULL DEFAULT 'ACTIVE',
  "caption" TEXT,
  "generateNewCaption" BOOLEAN NOT NULL DEFAULT true,
  "useLatestProductData" BOOLEAN NOT NULL DEFAULT true,
  "skipOutOfStock" BOOLEAN NOT NULL DEFAULT true,
  "idempotencyKey" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "lastStatus" TEXT,
  "lastError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3),
  "claimExpiresAt" TIMESTAMP(3),
  "claimNonce" TEXT,
  "pauseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPostAutomation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialAutomationRun" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "socialPostId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" "SocialAutomationRunStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "externalPostId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "cycleNumber" INTEGER NOT NULL,
  CONSTRAINT "SocialAutomationRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OAuthState" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "provider" "SocialPlatform" NOT NULL DEFAULT 'facebook',
  "state" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "encryptedAccessToken" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CommunityPost" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "productId" TEXT,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "imageUrl" TEXT,
  "topic" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "likesCount" INTEGER NOT NULL DEFAULT 0,
  "commentsCount" INTEGER NOT NULL DEFAULT 0,
  "moderationNote" TEXT,
  "moderatedAt" TIMESTAMP(3),
  "moderatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CommunityPostComment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'visible',
  "moderationNote" TEXT,
  "moderatedAt" TIMESTAMP(3),
  "moderatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityPostComment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CommunityPostLike" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityPostLike_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CommunityPostReport" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "moderatedAt" TIMESTAMP(3),
  "moderatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityPostReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PhoneVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoneVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProviderAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "providerEmail" TEXT,
  "providerEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  "providerUsername" TEXT,
  "providerAvatarUrl" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FlashSaleCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "bannerImage" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlashSaleCampaign_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FlashSaleEntry" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "salePrice" DECIMAL(65,30) NOT NULL,
  "allocatedStock" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlashSaleEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TenantMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "invitedById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TenantSetting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "locale" TEXT NOT NULL DEFAULT 'en-BD',
  "freeShippingThreshold" DECIMAL(65,30) NOT NULL DEFAULT 2500,
  "defaultProductWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "fallbackDeliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 130,
  "cartRecoveryDelayMins" INTEGER NOT NULL DEFAULT 120,
  "signupBonusCoins" INTEGER NOT NULL DEFAULT 100,
  "dailyLoginBaseCoins" INTEGER NOT NULL DEFAULT 10,
  "dailyLoginMaxCoins" INTEGER NOT NULL DEFAULT 70,
  "orderCashbackBps" INTEGER NOT NULL DEFAULT 200,
  "referralInviterCoins" INTEGER NOT NULL DEFAULT 150,
  "referralInviteeCoins" INTEGER NOT NULL DEFAULT 100,
  "surpriseRewardChance" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  "spinEnabled" BOOLEAN NOT NULL DEFAULT true,
  "spinDailyLimit" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" TEXT NOT NULL DEFAULT 'completed',
  "source" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "balanceAfter" DECIMAL(65,30),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RewardLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "eventType" TEXT NOT NULL,
  "coinsAmount" INTEGER NOT NULL DEFAULT 0,
  "walletAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "referenceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardLog_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "code" TEXT NOT NULL,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "successfulReferrals" INTEGER NOT NULL DEFAULT 0,
  "earnings" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReferralAttribution" (
  "id" TEXT NOT NULL,
  "codeId" TEXT NOT NULL,
  "inviterId" TEXT NOT NULL,
  "inviteeId" TEXT,
  "orderId" TEXT,
  "inviteeEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rewardGrantedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LoginStreak" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentStreak" INTEGER NOT NULL DEFAULT 0,
  "longestStreak" INTEGER NOT NULL DEFAULT 0,
  "lastClaimedOn" TIMESTAMP(3),
  "totalClaimedCoins" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginStreak_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SpinReward" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "label" TEXT NOT NULL,
  "rewardType" TEXT NOT NULL,
  "rewardValue" DECIMAL(65,30) NOT NULL,
  "probability" DOUBLE PRECISION NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpinReward_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SpinHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "rewardId" TEXT,
  "rewardLabel" TEXT NOT NULL,
  "rewardType" TEXT NOT NULL,
  "rewardValue" DECIMAL(65,30) NOT NULL,
  "dateKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpinHistory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Mission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "targetCount" INTEGER NOT NULL DEFAULT 1,
  "rewardCoins" INTEGER NOT NULL DEFAULT 0,
  "rewardWallet" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MissionProgress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionProgress_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "createdById" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "actionUrl" TEXT,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "orderUpdates" BOOLEAN NOT NULL DEFAULT true,
  "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
  "payoutAlerts" BOOLEAN NOT NULL DEFAULT true,
  "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VerificationSubmission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "documentType" TEXT NOT NULL DEFAULT 'nid',
  "businessName" TEXT,
  "businessLicenseUrl" TEXT,
  "notes" TEXT,
  "rejectionReason" TEXT,
  "riskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VerificationSubmission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VerificationDocument" (
  "id" TEXT NOT NULL,
  "verificationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL DEFAULT 'image',
  "ownerType" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "fieldName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "bytes" INTEGER,
  "format" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PayoutMethod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "accountName" TEXT,
  "encryptedAccountNumber" TEXT,
  "encryptedRoutingNumber" TEXT,
  "encryptedMobileNumber" TEXT,
  "accountLast4" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutMethod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PayoutTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payoutMethodId" TEXT,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reference" TEXT,
  "notes" TEXT,
  "metadata" JSONB,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayoutTransaction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LoginActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "deviceName" TEXT,
  "location" TEXT,
  "loggedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountActionRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "orderId" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "resolutionNote" TEXT,
  "processedById" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountActionRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserRiskFlag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdById" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'medium',
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserRiskFlag_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResellerMarkup" (
  "id" TEXT NOT NULL,
  "resellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "markupAmount" DECIMAL(65,30) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResellerMarkup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResellerCommission" (
  "id" TEXT NOT NULL,
  "resellerId" TEXT NOT NULL,
  "orderId" TEXT,
  "productId" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResellerCommission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResellerReferral" (
  "id" TEXT NOT NULL,
  "resellerId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResellerReferral_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ResellerPayout" (
  "id" TEXT NOT NULL,
  "resellerId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "notes" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResellerPayout_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserInteraction" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "productId" TEXT NOT NULL,
  "interactionType" TEXT NOT NULL,
  "sessionId" TEXT,
  "deviceType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserInteraction_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RecommendationAnalytic" (
  "id" TEXT NOT NULL,
  "recommendationId" TEXT NOT NULL,
  "userId" TEXT,
  "productId" TEXT NOT NULL,
  "position" INTEGER,
  "clicked" BOOLEAN NOT NULL DEFAULT false,
  "converted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecommendationAnalytic_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PriceHistory" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "price" DECIMAL(65,30) NOT NULL,
  "competitorPrices" JSONB,
  "demandScore" DOUBLE PRECISION,
  "conversionRate" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PricingSuggestion" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "suggestedPrice" DECIMAL(65,30) NOT NULL,
  "minPrice" DECIMAL(65,30),
  "maxPrice" DECIMAL(65,30),
  "confidenceScore" DOUBLE PRECISION,
  "reasons" JSONB,
  "applied" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PricingSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LedgerAccount" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JournalEntry" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "memo" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JournalLine" (
  "id" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "description" TEXT,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "invoiceUrl" TEXT,
  "documentUrl" TEXT,
  "subtotal" DECIMAL(65,30) NOT NULL,
  "tax" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "total" DECIMAL(65,30) NOT NULL,
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "vendor" TEXT,
  "notes" TEXT,
  "incurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User" ("supabaseAuthId");
CREATE UNIQUE INDEX "User_phone_key" ON "User" ("phone");
CREATE UNIQUE INDEX "User_storefrontSlug_key" ON "User" ("storefrontSlug");
CREATE UNIQUE INDEX "User_storefrontCustomDomain_key" ON "User" ("storefrontCustomDomain");
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User" ("telegramChatId");
CREATE UNIQUE INDEX "User_refCode_key" ON "User" ("refCode");
CREATE UNIQUE INDEX "Product_sku_key" ON "Product" ("sku");
CREATE UNIQUE INDEX "Product_slug_key" ON "Product" ("slug");
CREATE INDEX "Product_sellerId_idx" ON "Product" ("sellerId");
CREATE INDEX "Product_category_idx" ON "Product" ("category");
CREATE INDEX "Product_productStatus_publishedAt_idx" ON "Product" ("productStatus", "publishedAt");
CREATE INDEX "Product_createdAt_idx" ON "Product" ("createdAt");
CREATE INDEX "Product_rating_idx" ON "Product" ("rating");
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order" ("orderCode");
CREATE INDEX "Order_userId_idx" ON "Order" ("userId");
CREATE INDEX "Order_guestEmail_idx" ON "Order" ("guestEmail");
CREATE INDEX "Order_status_idx" ON "Order" ("status");
CREATE INDEX "Order_status_createdAt_idx" ON "Order" ("status", "createdAt");
CREATE INDEX "Order_tenantId_idx" ON "Order" ("tenantId");
CREATE INDEX "Order_paymentStatus_idx" ON "Order" ("paymentStatus");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem" ("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem" ("productId");
CREATE INDEX "OrderShipment_orderId_createdAt_idx" ON "OrderShipment" ("orderId", "createdAt");
CREATE INDEX "OrderShipment_sellerId_status_createdAt_idx" ON "OrderShipment" ("sellerId", "status", "createdAt");
CREATE INDEX "OrderShipment_warehouseId_status_createdAt_idx" ON "OrderShipment" ("warehouseId", "status", "createdAt");
CREATE INDEX "OrderShipment_courierProvider_status_createdAt_idx" ON "OrderShipment" ("courierProvider", "status", "createdAt");
CREATE INDEX "OrderShipment_bookingState_nextReconcileAt_idx" ON "OrderShipment" ("bookingState", "nextReconcileAt");
CREATE INDEX "OrderShipment_merchantReference_idx" ON "OrderShipment" ("merchantReference");
CREATE INDEX "OrderShipment_trackingId_idx" ON "OrderShipment" ("trackingId");
CREATE UNIQUE INDEX "OrderShipment_courierProvider_merchantReference_key" ON "OrderShipment" ("courierProvider", "merchantReference");
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_source_eventId_key" ON "ShipmentEvent" ("shipmentId", "source", "eventId");
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent" ("shipmentId", "occurredAt");
CREATE INDEX "ShipmentEvent_source_occurredAt_idx" ON "ShipmentEvent" ("source", "occurredAt");
CREATE UNIQUE INDEX "CourierBookingAttempt_shipmentId_attemptNumber_key" ON "CourierBookingAttempt" ("shipmentId", "attemptNumber");
CREATE INDEX "CourierBookingAttempt_provider_startedAt_idx" ON "CourierBookingAttempt" ("provider", "startedAt");
CREATE INDEX "CourierBookingAttempt_outcome_startedAt_idx" ON "CourierBookingAttempt" ("outcome", "startedAt");
CREATE UNIQUE INDEX "WebhookDelivery_provider_eventId_key" ON "WebhookDelivery" ("provider", "eventId");
CREATE INDEX "WebhookDelivery_provider_receivedAt_idx" ON "WebhookDelivery" ("provider", "receivedAt");
CREATE UNIQUE INDEX "CourierStoreMapping_provider_warehouseId_key" ON "CourierStoreMapping" ("provider", "warehouseId");
CREATE UNIQUE INDEX "CourierStoreMapping_provider_externalStoreId_key" ON "CourierStoreMapping" ("provider", "externalStoreId");
CREATE INDEX "CourierStoreMapping_provider_status_idx" ON "CourierStoreMapping" ("provider", "status");
CREATE UNIQUE INDEX "OrderShipmentItem_orderItemId_key" ON "OrderShipmentItem" ("orderItemId");
CREATE INDEX "OrderShipmentItem_shipmentId_createdAt_idx" ON "OrderShipmentItem" ("shipmentId", "createdAt");
CREATE INDEX "OrderShipmentItem_productId_idx" ON "OrderShipmentItem" ("productId");
CREATE UNIQUE INDEX "InventoryItem_productId_warehouseId_key" ON "InventoryItem" ("productId", "warehouseId");
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant" ("slug");
CREATE UNIQUE INDEX "Store_domain_key" ON "Store" ("domain");
CREATE UNIQUE INDEX "EmailVerificationToken_token_key" ON "EmailVerificationToken" ("token");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog" ("userId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog" ("entityType", "entityId");
CREATE INDEX "InventoryMovement_inventoryItemId_idx" ON "InventoryMovement" ("inventoryItemId");
CREATE INDEX "InventoryMovement_warehouseId_idx" ON "InventoryMovement" ("warehouseId");
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement" ("productId");
CREATE INDEX "StockReservation_productId_idx" ON "StockReservation" ("productId");
CREATE INDEX "StockReservation_orderId_idx" ON "StockReservation" ("orderId");
CREATE INDEX "StockReservation_status_idx" ON "StockReservation" ("status");
CREATE INDEX "PurchaseOrder_warehouseId_idx" ON "PurchaseOrder" ("warehouseId");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder" ("status");
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_productId_idx" ON "PurchaseOrderLine" ("purchaseOrderId", "productId");
CREATE UNIQUE INDEX "PaymentTransaction_paymentId_key" ON "PaymentTransaction" ("paymentId");
CREATE UNIQUE INDEX "PaymentTransaction_idempotencyKey_key" ON "PaymentTransaction" ("idempotencyKey");
CREATE INDEX "PaymentTransaction_orderId_idx" ON "PaymentTransaction" ("orderId");
CREATE INDEX "PaymentTransaction_customerId_idx" ON "PaymentTransaction" ("customerId");
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction" ("status");
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund" ("providerRefundId");
CREATE INDEX "Refund_transactionId_idx" ON "Refund" ("transactionId");
CREATE INDEX "Review_productId_createdAt_idx" ON "Review" ("productId", "createdAt");
CREATE UNIQUE INDEX "WishlistItem_userId_productId_key" ON "WishlistItem" ("userId", "productId");
CREATE INDEX "Address_userId_idx" ON "Address" ("userId");
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon" ("code");
CREATE INDEX "Coupon_sellerId_expiryDate_idx" ON "Coupon" ("sellerId", "expiryDate");
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost" ("slug");
CREATE INDEX "BlogPost_authorId_idx" ON "BlogPost" ("authorId");
CREATE UNIQUE INDEX "SocialAccount_sellerId_platform_accountId_key" ON "SocialAccount" ("sellerId", "platform", "accountId");
CREATE INDEX "SocialAccount_sellerId_platform_status_idx" ON "SocialAccount" ("sellerId", "platform", "status");
CREATE UNIQUE INDEX "SocialAutomationSetting_sellerId_key" ON "SocialAutomationSetting" ("sellerId");
CREATE UNIQUE INDEX "SocialPost_idempotencyKey_key" ON "SocialPost" ("idempotencyKey");
CREATE INDEX "SocialPost_sellerId_status_scheduledAt_idx" ON "SocialPost" ("sellerId", "status", "scheduledAt");
CREATE INDEX "SocialPost_sellerId_productId_createdAt_idx" ON "SocialPost" ("sellerId", "productId", "createdAt");
CREATE INDEX "SocialPost_automationId_idx" ON "SocialPost" ("automationId");
CREATE UNIQUE INDEX "SocialPostTarget_socialPostId_socialAccountId_key" ON "SocialPostTarget" ("socialPostId", "socialAccountId");
CREATE INDEX "SocialPostTarget_socialAccountId_status_idx" ON "SocialPostTarget" ("socialAccountId", "status");
CREATE UNIQUE INDEX "SocialPostAutomation_idempotencyKey_key" ON "SocialPostAutomation" ("idempotencyKey");
CREATE INDEX "SocialPostAutomation_sellerId_status_nextRunAt_idx" ON "SocialPostAutomation" ("sellerId", "status", "nextRunAt");
CREATE INDEX "SocialPostAutomation_sellerId_productId_status_idx" ON "SocialPostAutomation" ("sellerId", "productId", "status");
CREATE INDEX "SocialPostAutomation_status_nextRunAt_idx" ON "SocialPostAutomation" ("status", "nextRunAt");
CREATE INDEX "SocialPostAutomation_status_claimExpiresAt_idx" ON "SocialPostAutomation" ("status", "claimExpiresAt");
CREATE UNIQUE INDEX "SocialAutomationRun_idempotencyKey_key" ON "SocialAutomationRun" ("idempotencyKey");
CREATE UNIQUE INDEX "SocialAutomationRun_automationId_cycleNumber_key" ON "SocialAutomationRun" ("automationId", "cycleNumber");
CREATE INDEX "SocialAutomationRun_automationId_idx" ON "SocialAutomationRun" ("automationId");
CREATE INDEX "SocialAutomationRun_sellerId_idx" ON "SocialAutomationRun" ("sellerId");
CREATE INDEX "SocialAutomationRun_status_idx" ON "SocialAutomationRun" ("status");
CREATE INDEX "SocialAutomationRun_startedAt_idx" ON "SocialAutomationRun" ("startedAt");
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState" ("state");
CREATE INDEX "OAuthState_sellerId_provider_expiresAt_idx" ON "OAuthState" ("sellerId", "provider", "expiresAt");
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription" ("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription" ("userId");
CREATE INDEX "CommunityPost_status_createdAt_idx" ON "CommunityPost" ("status", "createdAt");
CREATE INDEX "CommunityPost_tenantId_status_createdAt_idx" ON "CommunityPost" ("tenantId", "status", "createdAt");
CREATE INDEX "CommunityPost_userId_createdAt_idx" ON "CommunityPost" ("userId", "createdAt");
CREATE INDEX "CommunityPost_productId_idx" ON "CommunityPost" ("productId");
CREATE INDEX "CommunityPost_moderatedById_idx" ON "CommunityPost" ("moderatedById");
CREATE INDEX "CommunityPostComment_postId_status_createdAt_idx" ON "CommunityPostComment" ("postId", "status", "createdAt");
CREATE INDEX "CommunityPostComment_userId_createdAt_idx" ON "CommunityPostComment" ("userId", "createdAt");
CREATE UNIQUE INDEX "CommunityPostLike_postId_userId_key" ON "CommunityPostLike" ("postId", "userId");
CREATE INDEX "CommunityPostLike_userId_createdAt_idx" ON "CommunityPostLike" ("userId", "createdAt");
CREATE UNIQUE INDEX "CommunityPostReport_postId_userId_key" ON "CommunityPostReport" ("postId", "userId");
CREATE INDEX "CommunityPostReport_status_createdAt_idx" ON "CommunityPostReport" ("status", "createdAt");
CREATE INDEX "CommunityPostReport_userId_createdAt_idx" ON "CommunityPostReport" ("userId", "createdAt");
CREATE INDEX "CommunityPostReport_userId_idx" ON "CommunityPostReport" ("userId");
CREATE UNIQUE INDEX "PhoneVerificationToken_token_key" ON "PhoneVerificationToken" ("token");
CREATE UNIQUE INDEX "ProviderAccount_provider_providerAccountId_key" ON "ProviderAccount" ("provider", "providerAccountId");
CREATE INDEX "ProviderAccount_userId_provider_idx" ON "ProviderAccount" ("userId", "provider");
CREATE INDEX "ProviderAccount_providerEmail_idx" ON "ProviderAccount" ("providerEmail");
CREATE UNIQUE INDEX "FlashSaleCampaign_slug_key" ON "FlashSaleCampaign" ("slug");
CREATE INDEX "FlashSaleCampaign_status_startsAt_endsAt_idx" ON "FlashSaleCampaign" ("status", "startsAt", "endsAt");
CREATE UNIQUE INDEX "FlashSaleEntry_campaignId_productId_key" ON "FlashSaleEntry" ("campaignId", "productId");
CREATE INDEX "FlashSaleEntry_sellerId_status_createdAt_idx" ON "FlashSaleEntry" ("sellerId", "status", "createdAt");
CREATE INDEX "FlashSaleEntry_campaignId_status_createdAt_idx" ON "FlashSaleEntry" ("campaignId", "status", "createdAt");
CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON "TenantMembership" ("userId", "tenantId");
CREATE INDEX "TenantMembership_tenantId_role_idx" ON "TenantMembership" ("tenantId", "role");
CREATE UNIQUE INDEX "TenantSetting_tenantId_key" ON "TenantSetting" ("tenantId");
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction" ("userId", "createdAt");
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "WalletTransaction" ("tenantId", "createdAt");
CREATE INDEX "RewardLog_userId_createdAt_idx" ON "RewardLog" ("userId", "createdAt");
CREATE INDEX "RewardLog_tenantId_createdAt_idx" ON "RewardLog" ("tenantId", "createdAt");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode" ("code");
CREATE INDEX "ReferralCode_userId_idx" ON "ReferralCode" ("userId");
CREATE INDEX "ReferralCode_tenantId_idx" ON "ReferralCode" ("tenantId");
CREATE INDEX "ReferralAttribution_inviterId_createdAt_idx" ON "ReferralAttribution" ("inviterId", "createdAt");
CREATE INDEX "ReferralAttribution_inviteeId_createdAt_idx" ON "ReferralAttribution" ("inviteeId", "createdAt");
CREATE INDEX "ReferralAttribution_codeId_orderId_idx" ON "ReferralAttribution" ("codeId", "orderId");
CREATE UNIQUE INDEX "LoginStreak_userId_key" ON "LoginStreak" ("userId");
CREATE INDEX "SpinReward_tenantId_isActive_displayOrder_idx" ON "SpinReward" ("tenantId", "isActive", "displayOrder");
CREATE UNIQUE INDEX "SpinHistory_userId_dateKey_key" ON "SpinHistory" ("userId", "dateKey");
CREATE INDEX "SpinHistory_tenantId_createdAt_idx" ON "SpinHistory" ("tenantId", "createdAt");
CREATE UNIQUE INDEX "Mission_key_key" ON "Mission" ("key");
CREATE INDEX "Mission_tenantId_isActive_idx" ON "Mission" ("tenantId", "isActive");
CREATE UNIQUE INDEX "MissionProgress_userId_missionId_key" ON "MissionProgress" ("userId", "missionId");
CREATE INDEX "MissionProgress_userId_claimedAt_idx" ON "MissionProgress" ("userId", "claimedAt");
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification" ("userId", "createdAt");
CREATE INDEX "UserNotification_tenantId_createdAt_idx" ON "UserNotification" ("tenantId", "createdAt");
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference" ("userId");
CREATE UNIQUE INDEX "VerificationSubmission_userId_key" ON "VerificationSubmission" ("userId");
CREATE INDEX "VerificationDocument_verificationId_idx" ON "VerificationDocument" ("verificationId");
CREATE UNIQUE INDEX "MediaAsset_publicId_resourceType_key" ON "MediaAsset" ("publicId", "resourceType");
CREATE INDEX "MediaAsset_ownerType_ownerId_idx" ON "MediaAsset" ("ownerType", "ownerId");
CREATE INDEX "MediaAsset_entityType_entityId_idx" ON "MediaAsset" ("entityType", "entityId");
CREATE INDEX "MediaAsset_status_createdAt_idx" ON "MediaAsset" ("status", "createdAt");
CREATE INDEX "PayoutTransaction_userId_idx" ON "PayoutTransaction" ("userId");
CREATE INDEX "PayoutTransaction_status_idx" ON "PayoutTransaction" ("status");
CREATE INDEX "PayoutTransaction_payoutMethodId_idx" ON "PayoutTransaction" ("payoutMethodId");
CREATE UNIQUE INDEX "LoginActivity_userId_sessionId_key" ON "LoginActivity" ("userId", "sessionId");
CREATE INDEX "AccountActionRequest_orderId_type_status_idx" ON "AccountActionRequest" ("orderId", "type", "status");
CREATE INDEX "AccountActionRequest_processedById_idx" ON "AccountActionRequest" ("processedById");
CREATE INDEX "UserRiskFlag_userId_idx" ON "UserRiskFlag" ("userId");
CREATE INDEX "UserRiskFlag_createdById_idx" ON "UserRiskFlag" ("createdById");
CREATE UNIQUE INDEX "ResellerMarkup_resellerId_productId_key" ON "ResellerMarkup" ("resellerId", "productId");
CREATE UNIQUE INDEX "ResellerCommission_resellerId_orderId_productId_key" ON "ResellerCommission" ("resellerId", "orderId", "productId");
CREATE INDEX "ResellerCommission_resellerId_orderId_productId_idx" ON "ResellerCommission" ("resellerId", "orderId", "productId");
CREATE UNIQUE INDEX "ResellerReferral_code_key" ON "ResellerReferral" ("code");
CREATE UNIQUE INDEX "ResellerReferral_resellerId_key" ON "ResellerReferral" ("resellerId");
CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount" ("code");
CREATE UNIQUE INDEX "JournalEntry_reference_key" ON "JournalEntry" ("reference");
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice" ("orderId");
CREATE INDEX "Invoice_userId_idx" ON "Invoice" ("userId");

ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id");
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id");
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id");
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id");
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id");
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id");
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE;
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL;
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "OrderShipment" ("id") ON DELETE CASCADE;
ALTER TABLE "CourierBookingAttempt" ADD CONSTRAINT "CourierBookingAttempt_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "OrderShipment" ("id") ON DELETE CASCADE;
ALTER TABLE "CourierStoreMapping" ADD CONSTRAINT "CourierStoreMapping_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE;
ALTER TABLE "OrderShipmentItem" ADD CONSTRAINT "OrderShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "OrderShipment" ("id") ON DELETE CASCADE;
ALTER TABLE "OrderShipmentItem" ADD CONSTRAINT "OrderShipmentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem" ("id") ON DELETE CASCADE;
ALTER TABLE "OrderShipmentItem" ADD CONSTRAINT "OrderShipmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id");
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id");
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id");
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id");
ALTER TABLE "Store" ADD CONSTRAINT "Store_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id");
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE;
ALTER TABLE "Subsubcategory" ADD CONSTRAINT "Subsubcategory_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory" ("id") ON DELETE CASCADE;
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id");
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id");
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id");
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id");
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id");
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction" ("id");
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialAutomationSetting" ADD CONSTRAINT "SocialAutomationSetting_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "SocialPostAutomation" ("id") ON DELETE SET NULL;
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialPostAutomation" ADD CONSTRAINT "SocialPostAutomation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialPostAutomation" ADD CONSTRAINT "SocialPostAutomation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "SocialPostAutomation" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost" ("id") ON DELETE SET NULL;
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL;
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "CommunityPostComment" ADD CONSTRAINT "CommunityPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPostComment" ADD CONSTRAINT "CommunityPostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPostComment" ADD CONSTRAINT "CommunityPostComment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "CommunityPostLike" ADD CONSTRAINT "CommunityPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPostLike" ADD CONSTRAINT "CommunityPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "CommunityPostReport" ADD CONSTRAINT "CommunityPostReport_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "PhoneVerificationToken" ADD CONSTRAINT "PhoneVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "ProviderAccount" ADD CONSTRAINT "ProviderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "FlashSaleCampaign" ADD CONSTRAINT "FlashSaleCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "FlashSaleEntry" ADD CONSTRAINT "FlashSaleEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FlashSaleCampaign" ("id") ON DELETE CASCADE;
ALTER TABLE "FlashSaleEntry" ADD CONSTRAINT "FlashSaleEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "FlashSaleEntry" ADD CONSTRAINT "FlashSaleEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "FlashSaleEntry" ADD CONSTRAINT "FlashSaleEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE;
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "RewardLog" ADD CONSTRAINT "RewardLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "RewardLog" ADD CONSTRAINT "RewardLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ReferralCode" ("id") ON DELETE CASCADE;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL;
ALTER TABLE "LoginStreak" ADD CONSTRAINT "LoginStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SpinReward" ADD CONSTRAINT "SpinReward_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "SpinHistory" ADD CONSTRAINT "SpinHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "SpinHistory" ADD CONSTRAINT "SpinHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "SpinHistory" ADD CONSTRAINT "SpinHistory_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "SpinReward" ("id") ON DELETE SET NULL;
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE CASCADE;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE SET NULL;
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "VerificationSubmission" ADD CONSTRAINT "VerificationSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "VerificationSubmission" ADD CONSTRAINT "VerificationSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "VerificationSubmission" ("id") ON DELETE CASCADE;
ALTER TABLE "PayoutMethod" ADD CONSTRAINT "PayoutMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "PayoutTransaction" ADD CONSTRAINT "PayoutTransaction_payoutMethodId_fkey" FOREIGN KEY ("payoutMethodId") REFERENCES "PayoutMethod" ("id") ON DELETE SET NULL;
ALTER TABLE "LoginActivity" ADD CONSTRAINT "LoginActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "AccountActionRequest" ADD CONSTRAINT "AccountActionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "AccountActionRequest" ADD CONSTRAINT "AccountActionRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "UserRiskFlag" ADD CONSTRAINT "UserRiskFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "UserRiskFlag" ADD CONSTRAINT "UserRiskFlag_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "ResellerMarkup" ADD CONSTRAINT "ResellerMarkup_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "ResellerMarkup" ADD CONSTRAINT "ResellerMarkup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL;
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL;
ALTER TABLE "ResellerReferral" ADD CONSTRAINT "ResellerReferral_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "ResellerPayout" ADD CONSTRAINT "ResellerPayout_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "User" ("id") ON DELETE CASCADE;
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "RecommendationAnalytic" ADD CONSTRAINT "RecommendationAnalytic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL;
ALTER TABLE "RecommendationAnalytic" ADD CONSTRAINT "RecommendationAnalytic_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "PricingSuggestion" ADD CONSTRAINT "PricingSuggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id");
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount" ("id");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id");
