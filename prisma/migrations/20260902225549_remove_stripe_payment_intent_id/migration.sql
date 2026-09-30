-- AlterTable: Remove paymentIntentId column from Order table
-- This column was Stripe-specific and is no longer needed.

ALTER TABLE "public"."Order" DROP COLUMN IF EXISTS "paymentIntentId";
