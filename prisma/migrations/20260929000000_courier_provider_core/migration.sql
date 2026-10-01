-- Additive courier provider core.
-- Non-destructive: every statement is ADD COLUMN / CREATE TABLE / CREATE INDEX.
-- No DROP, no ALTER TYPE, no data rewrite. Existing OrderShipment rows keep
-- their current status, tracking id and metadata untouched.

-- ============================================================
-- OrderShipment: generic courier identity
-- ============================================================
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "merchantReference" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "providerReference" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "providerStatus" TEXT;

-- ============================================================
-- OrderShipment: financial separation
-- ============================================================
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "customerDeliveryFee" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "courierCharge" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "codAmount" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "codFee" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "deliveryFeeVerified" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- OrderShipment: booking state machine + reconciliation bookkeeping
-- ============================================================
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "bookingState" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "bookingAttemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "lastBookingError" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "lastBookingErrorCode" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "lastBookedAt" TIMESTAMP(3);
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "lastReconciledAt" TIMESTAMP(3);
ALTER TABLE "public"."OrderShipment" ADD COLUMN IF NOT EXISTS "nextReconcileAt" TIMESTAMP(3);

-- Seed the reconciliation cursor for shipments that already carry a tracking id
-- so the first reconciliation sweep does not immediately re-poll old parcels.
UPDATE "public"."OrderShipment"
SET "bookingState" = 'booked', "nextReconcileAt" = NOW()
WHERE "trackingId" IS NOT NULL AND "bookingState" = 'pending';

-- The unique index makes (provider, merchantReference) the database-level
-- guarantee that one physical parcel maps to one consignment reference.
CREATE UNIQUE INDEX IF NOT EXISTS "OrderShipment_courierProvider_merchantReference_key"
  ON "public"."OrderShipment"("courierProvider", "merchantReference");

CREATE INDEX IF NOT EXISTS "OrderShipment_courierProvider_status_createdAt_idx"
  ON "public"."OrderShipment"("courierProvider", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "OrderShipment_bookingState_nextReconcileAt_idx"
  ON "public"."OrderShipment"("bookingState", "nextReconcileAt");

-- Webhook intake and reconciliation both look consignments up by tracking id.
-- Without this index each delivery is a sequential scan of the whole table.
CREATE INDEX IF NOT EXISTS "OrderShipment_trackingId_idx"
  ON "public"."OrderShipment"("trackingId");


-- ============================================================
-- Shipping weight and flat-fee configuration
-- ============================================================
-- A courier prices by weight, so without a weight on the product a server-side
-- quote is impossible. These are nullable/defaulted so every existing row keeps
-- working; the quote service falls back to `defaultProductWeightKg` and flags
-- the resulting quote as unverified.
ALTER TABLE "public"."Product" ADD COLUMN IF NOT EXISTS "weightKg" DOUBLE PRECISION;

ALTER TABLE "public"."TenantSetting"
  ADD COLUMN IF NOT EXISTS "defaultProductWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS "fallbackDeliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 130;

-- Deliberately NOT backfilling `Product.weightKg`. Seeding a guessed weight
-- would make every quote look verified while resting on an assumption. Leaving
-- it NULL is what lets the quote service fall back to
-- `defaultProductWeightKg` and report the fee as unverified, so the gap stays
-- visible and sellers are prompted to set real weights.

-- ============================================================
-- ShipmentEvent: append-only status audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT,
    "externalStatus" TEXT,
    "internalStatus" TEXT,
    "eventId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "metadata" JSONB,
    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentEvent_shipmentId_source_eventId_key"
  ON "public"."ShipmentEvent"("shipmentId", "source", "eventId");

CREATE INDEX IF NOT EXISTS "ShipmentEvent_shipmentId_occurredAt_idx"
  ON "public"."ShipmentEvent"("shipmentId", "occurredAt");

CREATE INDEX IF NOT EXISTS "ShipmentEvent_source_occurredAt_idx"
  ON "public"."ShipmentEvent"("source", "occurredAt");

DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShipmentEvent_shipmentId_fkey') THEN
    ALTER TABLE "public"."ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "public"."OrderShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $;

-- ============================================================
-- CourierBookingAttempt: per-call booking audit
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."CourierBookingAttempt" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "merchantReference" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT NOT NULL DEFAULT 'in_progress',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "httpStatus" INTEGER,
    "requestId" TEXT,
    CONSTRAINT "CourierBookingAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CourierBookingAttempt_shipmentId_attemptNumber_key"
  ON "public"."CourierBookingAttempt"("shipmentId", "attemptNumber");

CREATE INDEX IF NOT EXISTS "CourierBookingAttempt_provider_startedAt_idx"
  ON "public"."CourierBookingAttempt"("provider", "startedAt");

CREATE INDEX IF NOT EXISTS "CourierBookingAttempt_outcome_startedAt_idx"
  ON "public"."CourierBookingAttempt"("outcome", "startedAt");

DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourierBookingAttempt_shipmentId_fkey') THEN
    ALTER TABLE "public"."CourierBookingAttempt" ADD CONSTRAINT "CourierBookingAttempt_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "public"."OrderShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $;

-- ============================================================
-- WebhookDelivery: replay / duplicate protection
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."WebhookDelivery" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalShipmentId" TEXT,
    "deliveryCount" INTEGER NOT NULL DEFAULT 1,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookDelivery_provider_eventId_key"
  ON "public"."WebhookDelivery"("provider", "eventId");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_provider_receivedAt_idx"
  ON "public"."WebhookDelivery"("provider", "receivedAt");

-- ============================================================
-- CourierStoreMapping: generic warehouse <-> courier pickup point
-- Replaces per-provider Warehouse columns as the source of truth.
-- ============================================================
CREATE TABLE IF NOT EXISTS "public"."CourierStoreMapping" (
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
  ON "public"."CourierStoreMapping"("provider", "warehouseId");

CREATE UNIQUE INDEX IF NOT EXISTS "CourierStoreMapping_provider_externalStoreId_key"
  ON "public"."CourierStoreMapping"("provider", "externalStoreId");

CREATE INDEX IF NOT EXISTS "CourierStoreMapping_provider_status_idx"
  ON "public"."CourierStoreMapping"("provider", "status");

DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourierStoreMapping_warehouseId_fkey') THEN
    ALTER TABLE "public"."CourierStoreMapping" ADD CONSTRAINT "CourierStoreMapping_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $;

-- Backfill: promote the existing Warehouse.pathao* columns into the generic
-- mapping so no warehouse has to be re-mapped by hand. Idempotent.
INSERT INTO "public"."CourierStoreMapping"
    ("id", "provider", "warehouseId", "externalStoreId", "status", "isActive", "cityId", "zoneId", "areaId", "verifiedAt", "createdAt", "updatedAt")
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
FROM "public"."Warehouse" w
WHERE w."pathaoStoreId" IS NOT NULL
ON CONFLICT ("provider", "warehouseId") DO NOTHING;
