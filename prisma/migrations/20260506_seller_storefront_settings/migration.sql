ALTER TABLE "public"."User"
  ADD COLUMN "storefrontSlug" TEXT,
  ADD COLUMN "storefrontBannerUrl" TEXT,
  ADD COLUMN "storefrontHeadline" TEXT,
  ADD COLUMN "storefrontAccentColor" TEXT,
  ADD COLUMN "storefrontCustomDomain" TEXT,
  ADD COLUMN "storefrontPublished" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "User_storefrontSlug_key" ON "public"."User"("storefrontSlug");
CREATE UNIQUE INDEX "User_storefrontCustomDomain_key" ON "public"."User"("storefrontCustomDomain");
