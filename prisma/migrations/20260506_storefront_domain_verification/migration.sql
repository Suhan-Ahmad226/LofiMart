ALTER TABLE "public"."User"
  ADD COLUMN "storefrontDomainStatus" TEXT DEFAULT 'unverified',
  ADD COLUMN "storefrontDomainVerificationToken" TEXT,
  ADD COLUMN "storefrontDomainVerifiedAt" TIMESTAMP(3);
