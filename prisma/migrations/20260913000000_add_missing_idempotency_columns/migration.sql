-- The add_social_automation migration was recorded as applied but its DDL did not
-- fully execute against the Supabase database. These columns are defined in the
-- Prisma schema but are missing from the live tables.

-- SocialPost.idempotencyKey
ALTER TABLE "SocialPost" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "SocialPost_idempotencyKey_key" ON "SocialPost"("idempotencyKey");

-- SocialPostAutomation.idempotencyKey
ALTER TABLE "SocialPostAutomation" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "SocialPostAutomation_idempotencyKey_key" ON "SocialPostAutomation"("idempotencyKey");

-- OAuthState.encryptedAccessToken + metadata
ALTER TABLE "OAuthState" ADD COLUMN "encryptedAccessToken" TEXT;
ALTER TABLE "OAuthState" ADD COLUMN "metadata" JSONB;