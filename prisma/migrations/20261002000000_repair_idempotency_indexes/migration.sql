-- Additive, non-destructive repair for idempotency guarantees.
-- Safe to run against an existing database; no data is deleted or rewritten.

-- Order creation idempotency must be enforced by PostgreSQL, not only application code.
CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key"
  ON "public"."Order"("idempotencyKey");

-- Courier booking retries must not create a second consignment for the same
-- provider/reference pair.
CREATE UNIQUE INDEX IF NOT EXISTS "OrderShipment_courierProvider_merchantReference_key"
  ON "public"."OrderShipment"("courierProvider", "merchantReference");
