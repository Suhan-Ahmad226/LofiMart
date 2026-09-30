-- Phase 3A: execution/lease primitives for recurring social automation.
-- Additive only. Existing automations, posts, accounts, and OAuth flows are unaffected.

-- Dedicated per-cycle run status enum (PENDING/CLAIMED are not part of SocialPostStatus).
CREATE TYPE "SocialAutomationRunStatus" AS ENUM ('PENDING', 'CLAIMED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- Optional link from a post to its source automation (one-time posts stay NULL).
ALTER TABLE "SocialPost" ADD COLUMN "automationId" TEXT;

-- SocialPostAutomation execution tracking + claim lease fields.
ALTER TABLE "SocialPostAutomation"
  ADD COLUMN "lastRunAt" TIMESTAMP(3),
  ADD COLUMN "lastStatus" TEXT,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN "claimNonce" TEXT,
  ADD COLUMN "pauseReason" TEXT;

-- One record per recurring execution/cycle.
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

-- Foreign keys (run -> automation cascade; run -> post SET NULL so history survives).
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "SocialPostAutomation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "SocialPostAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialAutomationRun" ADD CONSTRAINT "SocialAutomationRun_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Duplicate safety: one run per (automationId, cycleNumber); globally unique idempotency key.
CREATE UNIQUE INDEX "SocialAutomationRun_automationId_cycleNumber_key" ON "SocialAutomationRun"("automationId", "cycleNumber");
CREATE UNIQUE INDEX "SocialAutomationRun_idempotencyKey_key" ON "SocialAutomationRun"("idempotencyKey");

-- Due-automation lookup: status + nextRunAt; reclaim scan: status + claim lease.
CREATE INDEX "SocialPostAutomation_status_nextRunAt_idx" ON "SocialPostAutomation"("status", "nextRunAt");
CREATE INDEX "SocialPostAutomation_status_claimExpiresAt_idx" ON "SocialPostAutomation"("status", "claimExpiresAt");

-- Post-to-automation and run lookup indexes.
CREATE INDEX "SocialPost_automationId_idx" ON "SocialPost"("automationId");
CREATE INDEX "SocialAutomationRun_automationId_idx" ON "SocialAutomationRun"("automationId");
CREATE INDEX "SocialAutomationRun_sellerId_idx" ON "SocialAutomationRun"("sellerId");
CREATE INDEX "SocialAutomationRun_status_idx" ON "SocialAutomationRun"("status");
CREATE INDEX "SocialAutomationRun_startedAt_idx" ON "SocialAutomationRun"("startedAt");