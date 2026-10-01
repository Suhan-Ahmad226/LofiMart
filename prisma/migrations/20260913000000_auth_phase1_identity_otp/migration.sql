-- Phase 1 - Authentication: unique phone identity, Supabase auth link, hashed OTP challenges.
-- IMPORTANT: This migration is created for review and has NOT been applied.
-- Pre-flight checks before applying in any environment:
--
--   1) Duplicate phone numbers (required, otherwise CREATE UNIQUE INDEX will fail):
--        SELECT phone, COUNT(*) FROM "User" GROUP BY phone HAVING COUNT(*) > 1;
--      If rows are returned, deduplicate/merge them first.
--
--   2) Verify no table named "OtpChallenge" already exists.
--
--   3) Run via a reversible path (e.g. `prisma migrate deploy` on a copy) and back up first.

-- Unique phone identity (Postgres UNIQUE permits multiple NULLs).
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- Store the Supabase auth user id so local verification can confirm the Supabase identity.
ALTER TABLE "User" ADD COLUMN "supabaseAuthId" TEXT;
CREATE UNIQUE INDEX "User_supabaseAuthId_key" ON "User"("supabaseAuthId");

-- Hashed one-time password challenges (email + optional WhatsApp delivery).
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "purpose" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpChallenge_identifier_purpose_used_createdAt_idx" ON "OtpChallenge"("identifier", "purpose", "used", "createdAt");
CREATE INDEX "OtpChallenge_userId_purpose_idx" ON "OtpChallenge"("userId", "purpose");

ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;