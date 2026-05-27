ALTER TABLE "public"."User"
  ALTER COLUMN "sellerStatus" SET DEFAULT 'draft',
  ADD COLUMN "submittedForReviewAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "suspensionReason" TEXT;

ALTER TABLE "public"."Product"
  ADD COLUMN "productStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "public"."User"
SET "sellerStatus" = 'approved'
WHERE "role" = 'seller'
  AND COALESCE("sellerStatus", 'active') = 'active';

UPDATE "public"."Product"
SET
  "productStatus" = 'published',
  "publishedAt" = COALESCE("publishedAt", "createdAt")
WHERE "sellerId" IS NOT NULL;

ALTER TABLE "public"."User"
  ADD CONSTRAINT "User_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "public"."User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
