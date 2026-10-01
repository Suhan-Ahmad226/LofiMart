CREATE TYPE "SocialPlatform" AS ENUM ('facebook');
CREATE TYPE "SocialAccountStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR');
CREATE TYPE "SocialPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "SocialAutomationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');

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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPostAutomation_pkey" PRIMARY KEY ("id")
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

CREATE UNIQUE INDEX "SocialAccount_sellerId_platform_accountId_key" ON "SocialAccount"("sellerId", "platform", "accountId");
CREATE INDEX "SocialAccount_sellerId_platform_status_idx" ON "SocialAccount"("sellerId", "platform", "status");

CREATE UNIQUE INDEX "SocialAutomationSetting_sellerId_key" ON "SocialAutomationSetting"("sellerId");

CREATE INDEX "SocialPost_sellerId_status_scheduledAt_idx" ON "SocialPost"("sellerId", "status", "scheduledAt");
CREATE INDEX "SocialPost_sellerId_productId_createdAt_idx" ON "SocialPost"("sellerId", "productId", "createdAt");
CREATE UNIQUE INDEX "SocialPost_idempotencyKey_key" ON "SocialPost"("idempotencyKey");

CREATE UNIQUE INDEX "SocialPostTarget_socialPostId_socialAccountId_key" ON "SocialPostTarget"("socialPostId", "socialAccountId");
CREATE INDEX "SocialPostTarget_socialAccountId_status_idx" ON "SocialPostTarget"("socialAccountId", "status");

CREATE INDEX "SocialPostAutomation_sellerId_status_nextRunAt_idx" ON "SocialPostAutomation"("sellerId", "status", "nextRunAt");
CREATE INDEX "SocialPostAutomation_sellerId_productId_status_idx" ON "SocialPostAutomation"("sellerId", "productId", "status");
CREATE UNIQUE INDEX "SocialPostAutomation_idempotencyKey_key" ON "SocialPostAutomation"("idempotencyKey");

CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");
CREATE INDEX "OAuthState_sellerId_provider_expiresAt_idx" ON "OAuthState"("sellerId", "provider", "expiresAt");

ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialAutomationSetting" ADD CONSTRAINT "SocialAutomationSetting_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPostTarget" ADD CONSTRAINT "SocialPostTarget_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPostAutomation" ADD CONSTRAINT "SocialPostAutomation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPostAutomation" ADD CONSTRAINT "SocialPostAutomation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthState" ADD CONSTRAINT "OAuthState_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
