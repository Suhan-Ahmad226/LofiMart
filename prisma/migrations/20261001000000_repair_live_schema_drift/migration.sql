-- Production drift repair: additive only.
-- Safe to run whether the courier core migration was recorded as applied or not.
-- No DROP, DELETE, TRUNCATE, ALTER TYPE removal, or destructive rewrite.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'unpaid';
  END IF;
END $$;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weightKg" DOUBLE PRECISION;
ALTER TABLE "TenantSetting"
  ADD COLUMN IF NOT EXISTS "defaultProductWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS "fallbackDeliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 130;

ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "merchantReference" TEXT;
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "providerReference" TEXT;
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "providerStatus" TEXT;
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "customerDeliveryFee" DECIMAL(65,30);
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "courierCharge" DECIMAL(65,30);
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "codAmount" DECIMAL(65,30);
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "codFee" DECIMAL(65,30);
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "deliveryFeeVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "bookingState" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "bookingAttemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "lastBookingError" TEXT;
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "lastBookingErrorCode" TEXT;
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "lastBookedAt" TIMESTAMP(3);
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3);
ALTER TABLE "OrderShipment" ADD COLUMN IF NOT EXISTS "nextReconcileAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderShipment_courierProvider_merchantReference_key"
  ON "OrderShipment"("courierProvider", "merchantReference");
CREATE INDEX IF NOT EXISTS "OrderShipment_courierProvider_status_createdAt_idx"
  ON "OrderShipment"("courierProvider", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderShipment_bookingState_nextReconcileAt_idx"
  ON "OrderShipment"("bookingState", "nextReconcileAt");
CREATE INDEX IF NOT EXISTS "OrderShipment_trackingId_idx"
  ON "OrderShipment"("trackingId");

CREATE TABLE IF NOT EXISTS "CourierStoreMapping" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "externalStoreId" TEXT NOT NULL,
  "externalStoreName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "cityId" INTEGER,
  "zoneId" INTEGER,
  "areaId" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourierStoreMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CourierStoreMapping_provider_warehouseId_key"
  ON "CourierStoreMapping"("provider", "warehouseId");
CREATE UNIQUE INDEX IF NOT EXISTS "CourierStoreMapping_provider_externalStoreId_key"
  ON "CourierStoreMapping"("provider", "externalStoreId");
CREATE INDEX IF NOT EXISTS "CourierStoreMapping_provider_status_idx"
  ON "CourierStoreMapping"("provider", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CourierStoreMapping_warehouseId_fkey'
  ) THEN
    ALTER TABLE "CourierStoreMapping"
      ADD CONSTRAINT "CourierStoreMapping_warehouseId_fkey"
      FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "CourierStoreMapping"
  ("id","provider","warehouseId","externalStoreId","status","isActive","cityId","zoneId","areaId","verifiedAt","createdAt","updatedAt")
SELECT
  'csm_legacy_' || w."id",
  'pathao',
  w."id",
  w."pathaoStoreId"::TEXT,
  'active',
  true,
  w."pathaoCityId",
  w."pathaoZoneId",
  w."pathaoAreaId",
  NOW(),
  NOW(),
  NOW()
FROM "Warehouse" w
WHERE w."pathaoStoreId" IS NOT NULL
ON CONFLICT ("provider","warehouseId") DO NOTHING;
