ALTER TABLE "public"."Coupon"
  ADD COLUMN "sellerId" TEXT;

ALTER TABLE "public"."Coupon"
  ADD CONSTRAINT "Coupon_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Coupon_sellerId_expiryDate_idx" ON "public"."Coupon"("sellerId", "expiryDate");
