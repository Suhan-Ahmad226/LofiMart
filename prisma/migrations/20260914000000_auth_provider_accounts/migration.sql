-- Auth: local provider-identity mapping for safe account linking.
-- IMPORTANT: Review migration - NOT applied automatically.
--
-- Because the live database has drift and remote migrations not present locally,
-- this migration (like auth_phase1/3/5) must be applied via the standard
-- `prisma migrate deploy` flow on a reviewed copy BEFORE any environment upgrade.
--
-- Pre-flight checks:
--   1) Confirm the pending auth_phase1/3/5 migrations were applied first
--      (OtpChallenge table must already exist so this migration stays consistent).
--   2) Back up the database before applying.
--
-- Non-destructive: creates a new table only; no existing columns are touched.

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

CREATE UNIQUE INDEX "ProviderAccount_provider_providerAccountId_key" ON "ProviderAccount"("provider", "providerAccountId");
CREATE INDEX "ProviderAccount_userId_provider_idx" ON "ProviderAccount"("userId", "provider");
CREATE INDEX "ProviderAccount_providerEmail_idx" ON "ProviderAccount"("providerEmail");

ALTER TABLE "ProviderAccount" ADD CONSTRAINT "ProviderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;