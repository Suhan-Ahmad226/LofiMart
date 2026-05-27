CREATE TABLE IF NOT EXISTS "FlashSaleCampaign" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "bannerImage" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlashSaleCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FlashSaleEntry" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "salePrice" DECIMAL(65,30) NOT NULL,
  "allocatedStock" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "note" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlashSaleEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FlashSaleCampaign_slug_key" ON "FlashSaleCampaign"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "FlashSaleEntry_campaignId_productId_key" ON "FlashSaleEntry"("campaignId", "productId");
CREATE INDEX IF NOT EXISTS "FlashSaleCampaign_status_startsAt_endsAt_idx" ON "FlashSaleCampaign"("status", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "FlashSaleEntry_sellerId_status_createdAt_idx" ON "FlashSaleEntry"("sellerId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "FlashSaleEntry_campaignId_status_createdAt_idx" ON "FlashSaleEntry"("campaignId", "status", "createdAt");

ALTER TABLE "FlashSaleCampaign"
  ADD CONSTRAINT "FlashSaleCampaign_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FlashSaleEntry"
  ADD CONSTRAINT "FlashSaleEntry_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "FlashSaleCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlashSaleEntry"
  ADD CONSTRAINT "FlashSaleEntry_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlashSaleEntry"
  ADD CONSTRAINT "FlashSaleEntry_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FlashSaleEntry"
  ADD CONSTRAINT "FlashSaleEntry_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
