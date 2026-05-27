ALTER TABLE "public"."Product" ADD COLUMN IF NOT EXISTS "sku" TEXT;
ALTER TABLE "public"."Order" ADD COLUMN IF NOT EXISTS "orderCode" TEXT;
ALTER TABLE "public"."OrderItem" ADD COLUMN IF NOT EXISTS "variantSummary" TEXT;

UPDATE "public"."Product"
SET "sku" = CONCAT(
  COALESCE(NULLIF(UPPER(SUBSTRING(REGEXP_REPLACE(COALESCE("category", ''), '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 3)), ''), 'PRD'),
  '-',
  UPPER(SUBSTRING(REGEXP_REPLACE("id", '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 6))
)
WHERE "sku" IS NULL;

UPDATE "public"."Order"
SET "orderCode" = CONCAT(
  'ORD-',
  UPPER(SUBSTRING(REGEXP_REPLACE("id", '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 8))
)
WHERE "orderCode" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Product_sku_key'
  ) THEN
    CREATE UNIQUE INDEX "Product_sku_key" ON "public"."Product"("sku");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Order_orderCode_key'
  ) THEN
    CREATE UNIQUE INDEX "Order_orderCode_key" ON "public"."Order"("orderCode");
  END IF;
END $$;
