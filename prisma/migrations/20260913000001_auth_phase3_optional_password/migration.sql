-- Phase 3: optional password (passwordHash becomes nullable).
-- Accounts created via OAuth or OTP (no password chosen) store NULL here;
-- passwords remain verified through Supabase. NOT APPLIED until the user runs it.
--
-- Pre-flight: no destructive change. Existing rows are unaffected.

ALTER TABLE "public"."User" ALTER COLUMN "passwordHash" DROP NOT NULL;