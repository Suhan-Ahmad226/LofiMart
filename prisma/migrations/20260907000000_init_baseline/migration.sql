-- Baseline migration for LofiMart
-- Adds missing fields, enum values, indexes, and FK relations

-- ============================================================
-- 1. User model: add refCode and referral fields
-- ============================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "refCode" VARCHAR(20);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referral" VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS "User_refCode_key" ON "User"("refCode");

-- ============================================================
-- 2. Enums: add pending value
-- ============================================================
DO $$ BEGIN
  ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. Indexes
-- ============================================================

-- ResellerCommission (already has @@unique, which creates an index)
-- No additional index needed

-- UserRiskFlag
CREATE INDEX IF NOT EXISTS "UserRiskFlag_userId_idx" ON "UserRiskFlag"("userId");
CREATE INDEX IF NOT EXISTS "UserRiskFlag_createdById_idx" ON "UserRiskFlag"("createdById");

-- ReferralAttribution
CREATE INDEX IF NOT EXISTS "ReferralAttribution_codeId_idx" ON "ReferralAttribution"("codeId");
CREATE INDEX IF NOT EXISTS "ReferralAttribution_orderId_idx" ON "ReferralAttribution"("orderId");

-- PayoutTransaction
CREATE INDEX IF NOT EXISTS "PayoutTransaction_payoutMethodId_idx" ON "PayoutTransaction"("payoutMethodId");

-- InventoryMovement
CREATE INDEX IF NOT EXISTS "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");

-- PurchaseOrderLine
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_purchaseOrderId_productId_idx" ON "PurchaseOrderLine"("purchaseOrderId", "productId");

-- VerificationDocument
CREATE INDEX IF NOT EXISTS "VerificationDocument_verificationId_idx" ON "VerificationDocument"("verificationId");

-- CommunityPost
CREATE INDEX IF NOT EXISTS "CommunityPost_productId_idx" ON "CommunityPost"("productId");
CREATE INDEX IF NOT EXISTS "CommunityPost_moderatedById_idx" ON "CommunityPost"("moderatedById");

-- AccountActionRequest
CREATE INDEX IF NOT EXISTS "AccountActionRequest_processedById_idx" ON "AccountActionRequest"("processedById");

-- UserNotification
CREATE INDEX IF NOT EXISTS "UserNotification_createdById_idx" ON "UserNotification"("createdById");

-- Session
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- PasswordResetToken
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- EmailVerificationToken
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- PhoneVerificationToken
CREATE INDEX IF NOT EXISTS "PhoneVerificationToken_userId_idx" ON "PhoneVerificationToken"("userId");

-- ============================================================
-- 4. FK relations (columns already exist in schema)
-- ============================================================

-- StockReservation.orderId -> Order
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StockReservation_orderId_fkey'
  ) THEN
    ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- PaymentTransaction.customerId -> User
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentTransaction_customerId_fkey'
  ) THEN
    ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL;
  END IF;
END $$;
