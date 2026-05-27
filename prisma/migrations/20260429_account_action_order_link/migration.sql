ALTER TABLE "public"."AccountActionRequest"
ADD COLUMN IF NOT EXISTS "orderId" TEXT;

CREATE INDEX IF NOT EXISTS "AccountActionRequest_orderId_type_status_idx"
ON "public"."AccountActionRequest" ("orderId", "type", "status");
