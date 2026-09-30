-- Phase 5 - Auth: guest checkout + order claiming.
-- IMPORTANT: This migration is created for review and has NOT been applied.
-- Non-destructive: makes "userId" nullable and adds guest identity columns.
--
-- Pre-flight checks before applying:
--   1) Run on a copy / backup first (`prisma migrate deploy` style flow).
--   2) Verify no future migration already introduced these columns.
--
-- No existing data is touched:
--   - "userId" only loses the NOT NULL constraint (existing rows keep their values).
--   - All new columns are nullable.

ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "Order" ADD COLUMN "guestEmail" TEXT;
ALTER TABLE "Order" ADD COLUMN "guestPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN "claimedAt" TIMESTAMP(3);

CREATE INDEX "Order_guestEmail_idx" ON "Order"("guestEmail");
CREATE INDEX "Order_claimedAt_idx" ON "Order"("claimedAt");