-- Bind guest_claim OTP challenges to a business scope (the order id) so a code
-- minted for one guest order can never be redeemed against a sibling order that
-- shares the same email/phone identifier.

-- AlterTable
ALTER TABLE "OtpChallenge" ADD COLUMN "scope" TEXT;

-- CreateIndex
CREATE INDEX "OtpChallenge_identifier_purpose_scope_used_createdAt_idx" ON "OtpChallenge"("identifier", "purpose", "scope", "used", "createdAt");