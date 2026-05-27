CREATE TABLE "public"."TenantMembership" (
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

CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON "public"."TenantMembership"("userId", "tenantId");
CREATE INDEX "TenantMembership_tenantId_role_idx" ON "public"."TenantMembership"("tenantId", "role");

CREATE TABLE "public"."TenantSetting" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "locale" TEXT NOT NULL DEFAULT 'en-BD',
  "freeShippingThreshold" DECIMAL(65,30) NOT NULL DEFAULT 2500,
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

CREATE UNIQUE INDEX "TenantSetting_tenantId_key" ON "public"."TenantSetting"("tenantId");

CREATE TABLE "public"."WalletTransaction" (
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

CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "public"."WalletTransaction"("userId", "createdAt");
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "public"."WalletTransaction"("tenantId", "createdAt");

CREATE TABLE "public"."RewardLog" (
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

CREATE INDEX "RewardLog_userId_createdAt_idx" ON "public"."RewardLog"("userId", "createdAt");
CREATE INDEX "RewardLog_tenantId_createdAt_idx" ON "public"."RewardLog"("tenantId", "createdAt");

CREATE TABLE "public"."ReferralCode" (
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

CREATE UNIQUE INDEX "ReferralCode_code_key" ON "public"."ReferralCode"("code");
CREATE INDEX "ReferralCode_userId_idx" ON "public"."ReferralCode"("userId");
CREATE INDEX "ReferralCode_tenantId_idx" ON "public"."ReferralCode"("tenantId");

CREATE TABLE "public"."ReferralAttribution" (
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

CREATE INDEX "ReferralAttribution_inviterId_createdAt_idx" ON "public"."ReferralAttribution"("inviterId", "createdAt");
CREATE INDEX "ReferralAttribution_inviteeId_createdAt_idx" ON "public"."ReferralAttribution"("inviteeId", "createdAt");

CREATE TABLE "public"."LoginStreak" (
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

CREATE UNIQUE INDEX "LoginStreak_userId_key" ON "public"."LoginStreak"("userId");

CREATE TABLE "public"."SpinReward" (
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

CREATE INDEX "SpinReward_tenantId_isActive_displayOrder_idx" ON "public"."SpinReward"("tenantId", "isActive", "displayOrder");

CREATE TABLE "public"."SpinHistory" (
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

CREATE UNIQUE INDEX "SpinHistory_userId_dateKey_key" ON "public"."SpinHistory"("userId", "dateKey");
CREATE INDEX "SpinHistory_tenantId_createdAt_idx" ON "public"."SpinHistory"("tenantId", "createdAt");

CREATE TABLE "public"."Mission" (
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

CREATE UNIQUE INDEX "Mission_key_key" ON "public"."Mission"("key");
CREATE INDEX "Mission_tenantId_isActive_idx" ON "public"."Mission"("tenantId", "isActive");

CREATE TABLE "public"."MissionProgress" (
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

CREATE UNIQUE INDEX "MissionProgress_userId_missionId_key" ON "public"."MissionProgress"("userId", "missionId");
CREATE INDEX "MissionProgress_userId_claimedAt_idx" ON "public"."MissionProgress"("userId", "claimedAt");

CREATE TABLE "public"."UserNotification" (
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

CREATE INDEX "UserNotification_userId_createdAt_idx" ON "public"."UserNotification"("userId", "createdAt");
CREATE INDEX "UserNotification_tenantId_createdAt_idx" ON "public"."UserNotification"("tenantId", "createdAt");

ALTER TABLE "public"."TenantMembership"
  ADD CONSTRAINT "TenantMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."TenantMembership"
  ADD CONSTRAINT "TenantMembership_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."TenantMembership"
  ADD CONSTRAINT "TenantMembership_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."TenantSetting"
  ADD CONSTRAINT "TenantSetting_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."TenantSetting"
  ADD CONSTRAINT "TenantSetting_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."RewardLog"
  ADD CONSTRAINT "RewardLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."RewardLog"
  ADD CONSTRAINT "RewardLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ReferralCode"
  ADD CONSTRAINT "ReferralCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ReferralCode"
  ADD CONSTRAINT "ReferralCode_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_codeId_fkey"
  FOREIGN KEY ("codeId") REFERENCES "public"."ReferralCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_inviterId_fkey"
  FOREIGN KEY ("inviterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_inviteeId_fkey"
  FOREIGN KEY ("inviteeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."LoginStreak"
  ADD CONSTRAINT "LoginStreak_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."SpinReward"
  ADD CONSTRAINT "SpinReward_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."SpinHistory"
  ADD CONSTRAINT "SpinHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."SpinHistory"
  ADD CONSTRAINT "SpinHistory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."SpinHistory"
  ADD CONSTRAINT "SpinHistory_rewardId_fkey"
  FOREIGN KEY ("rewardId") REFERENCES "public"."SpinReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Mission"
  ADD CONSTRAINT "Mission_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."MissionProgress"
  ADD CONSTRAINT "MissionProgress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."MissionProgress"
  ADD CONSTRAINT "MissionProgress_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "public"."Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."UserNotification"
  ADD CONSTRAINT "UserNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."UserNotification"
  ADD CONSTRAINT "UserNotification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."UserNotification"
  ADD CONSTRAINT "UserNotification_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
