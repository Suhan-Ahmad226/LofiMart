ALTER TABLE "public"."Product"
ADD COLUMN IF NOT EXISTS "variantOptions" JSONB;
