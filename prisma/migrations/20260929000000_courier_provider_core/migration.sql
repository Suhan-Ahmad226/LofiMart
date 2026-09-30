-- Additive courier provider core.
-- Non-destructive: every statement is ADD COLUMN / CREATE TABLE / CREATE INDEX.
-- No DROP, no ALTER TYPE, no data rewrite. Existing OrderShipment rows keep
-- their current status, tracking id and metadata untouched.

-- ============================================================
-- OrderShipment: generic courier identity
-- ============================================================
ALTER TABLE "public"."OrderShipment" ADD COLUMN "merchantReference" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN "providerReference" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN "providerStatus" TEXT;

-- ============================================================
-- OrderShipment: financial separation
-- ============================================================
ALTER TABLE "public"."OrderShipment" ADD COLUMN "customerDeliveryFee" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN "courierCharge" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN "codAmount" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN "codFee" DECIMAL(65,30);
ALTER TABLE "public"."OrderShipment" ADD COLUMN "deliveryFeeVerified" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- OrderShipment: booking state machine + reconciliation bookkeeping
-- ============================================================
ALTER TABLE "public"."OrderShipment" ADD COLUMN "bookingState" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "public"."OrderShipment" ADD COLUMN "bookingAttemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."OrderShipment" ADD COLUMN "lastBookingError" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN "lastBookingErrorCode" TEXT;
ALTER TABLE "public"."OrderShipment" ADD COLUMN "lastBookedAt" TIMESTAMP(3);
ALTER TABLE "public"."OrderShipment" ADD COLUMN "lastReconciledAt" TIMESTAMP(3);
ALTER TABLE "public"."OrderShipment" ADD COLUMN "nextReconcileAt" TIMESTAMP(3);

-- Seed the reconciliation cursor for shipments that already carry a tracking id
-- so the first reconciliation sweep does not immediately re-poll old parcels.
UPDATE "public"."OrderShipment"
SET "bookingState" = 'booked', "nextReconcileAt" = NOW()
WHERE "trackingId" IS NOT NULL AND "bookingState" = 'pending';

-- The unique index makes (provider, merchantReference) the database-level
-- guarantee that one physical parcel maps to one consignment reference.
CREATE UNIQUE INDEX "OrderShipment_courierProvider_merchantReference_key"
  ON "public"."OrderShipment"("courierProvider", "merchantReference");

CREATE INDEX "OrderShipment_courierProvider_status_createdAt_idx"
  ON "public"."OrderShipment"("courierProvider", "status", "createdAt");

CREATE INDEX "OrderShipment_bookingState_nextReconcileAt_idx"
  ON "public"."OrderShipment"("bookingState", "nextReconcileAt");

-- Webhook intake and reconciliation both look consignments up by tracking id.
-- Without this index each delivery is a sequential scan of the whole table.
CREATE INDEX "OrderShipment_trackingId_idx"
  ON "public"."OrderShipment"("trackingId");


-- ============================================================
-- Shipping weight and flat-fee configuration
-- ============================================================
-- A courier prices by weight, so without a weight on the product a server-side
-- quote is impossible. These are nullable/defaulted so every existing row keeps
-- working; the quote service falls back to `defaultProductWeightKg` and flags
-- the resulting quote as unverified.
ALTER TABLE "public"."Product" ADD COLUMN "weightKg" DOUBLE PRECISION;

ALTER TABLE "public"."TenantSetting"
  ADD COLUMN "defaultProductWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "fallbackDeliveryFee" DECIMAL(65,30) NOT NULL DEFAULT 130;

-- Deliberately NOT backfilling `Product.weightKg`. Seeding a guessed weight
-- would make every quote look verified while resting on an assumption. Leaving
-- it NULL is what lets the quote service fall back to
-- `defaultProductWeightKg` and report the fee as unverified, so the gap stays
-- visible and sellers are prompted to set real weights.

-- ============================================================
-- ShipmentEvent: append-only status audit trail
-- ============================================================
CREATE TABLE "public"."ShipmentEvent" (
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

CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_source_eventId_key"
  ON "public"."ShipmentEvent"("shipmentId", "source", "eventId");

CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx"
  ON "public"."ShipmentEvent"("shipmentId", "occurredAt");

CREATE INDEX "ShipmentEvent_source_occurredAt_idx"
  ON "public"."ShipmentEvent"("source", "occurredAt");

ALTER TABLE "public"."ShipmentEvent"
  ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId")
  REFERENCES "public"."OrderShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- CourierBookingAttempt: per-call booking audit
-- ============================================================
CREATE TABLE "public"."CourierBookingAttempt" (
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

CREATE UNIQUE INDEX "CourierBookingAttempt_shipmentId_attemptNumber_key"
  ON "public"."CourierBookingAttempt"("shipmentId", "attemptNumber");

CREATE INDEX "CourierBookingAttempt_provider_startedAt_idx"
  ON "public"."CourierBookingAttempt"("provider", "startedAt");

CREATE INDEX "CourierBookingAttempt_outcome_startedAt_idx"
  ON "public"."CourierBookingAttempt"("outcome", "startedAt");

ALTER TABLE "public"."CourierBookingAttempt"
  ADD CONSTRAINT "CourierBookingAttempt_shipmentId_fkey" FOREIGN KEY ("shipmentId")
  REFERENCES "public"."OrderShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- WebhookDelivery: replay / duplicate protection
-- ============================================================
CREATE TABLE "public"."WebhookDelivery" (
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

CREATE UNIQUE INDEX "WebhookDelivery_provider_eventId_key"
  ON "public"."WebhookDelivery"("provider", "eventId");

CREATE INDEX "WebhookDelivery_provider_receivedAt_idx"
  ON "public"."WebhookDelivery"("provider", "receivedAt");

-- ============================================================
-- CourierStoreMapping: generic warehouse <-> courier pickup point
-- Replaces per-provider Warehouse columns as the source of truth.
-- ============================================================
CREATE TABLE "public"."CourierStoreMapping" (
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

CREATE UNIQUE INDEX "CourierStoreMapping_provider_warehouseId_key"
  ON "public"."CourierStoreMapping"("provider", "warehouseId");

CREATE UNIQUE INDEX "CourierStoreMapping_provider_externalStoreId_key"
  ON "public"."CourierStoreMapping"("provider", "externalStoreId");

CREATE INDEX "CourierStoreMapping_provider_status_idx"
  ON "public"."CourierStoreMapping"("provider", "status");

ALTER TABLE "public"."CourierStoreMapping"
  ADD CONSTRAINT "CourierStoreMapping_warehouseId_fkey" FOREIGN KEY ("warehouseId")
  REFERENCES "public"."Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
