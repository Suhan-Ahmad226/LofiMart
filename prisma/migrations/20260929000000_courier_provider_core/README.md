# Additive courier provider core

Introduces the provider-agnostic courier layer.

## What it adds

**`OrderShipment` columns (all nullable or defaulted):**
- `merchantReference` — stable provider-side idempotency key. Reused across
  retries so a retry cannot create a second physical parcel.
- `providerReference`, `providerStatus` — provider identity and raw status,
  stored separately from the normalized `status` for audit.
- `customerDeliveryFee`, `courierCharge`, `codAmount`, `codFee`,
  `deliveryFeeVerified` — keeps what the customer paid, what the courier bills,
  the collectible amount and the COD handling fee as separate concepts.
- `bookingState`, `bookingAttemptCount`, `lastBookingError`,
  `lastBookingErrorCode`, `lastBookedAt` — booking lifecycle, independent of
  `ShipmentStatus`.
- `lastReconciledAt`, `nextReconcileAt` — reconciliation cursor.

**Shipping weight and fee configuration:**
- `Product.weightKg` — nullable per-unit weight in kilograms. A courier prices by
  weight, so a product without one cannot receive a real quote.
- `TenantSetting.defaultProductWeightKg` — weight assumed for a product with no
  `weightKg`. Quotes that rely on it are marked `verified: false` and the order
  records `deliveryFeeVerified = false`.
- `TenantSetting.fallbackDeliveryFee` — flat fee used when no live courier quote
  is obtainable.

`Product.weightKg` is deliberately **not** backfilled. Seeding a guessed weight
would make every quote look courier-verified while resting on an assumption;
leaving it `NULL` is what lets the quote service fall back and report the fee as
unverified, keeping the data gap visible and prompting sellers to set real
weights.

**New tables:**
- `ShipmentEvent` — append-only status audit trail, unique on
  `(shipmentId, source, eventId)` for webhook replay protection.
- `CourierBookingAttempt` — one row per booking API call, unique on
  `(shipmentId, attemptNumber)`.
- `WebhookDelivery` — webhook replay protection, unique on
  `(provider, eventId)`.
- `CourierStoreMapping` — generic warehouse ↔ courier pickup point, unique on
  `(provider, warehouseId)`. Replaces the per-provider `Warehouse.pathao*`
  columns as the source of truth.

**Indexes:** `(courierProvider, status, createdAt)` for the admin watchlist,
`(bookingState, nextReconcileAt)` for the reconciliation sweep, and a unique
index on `(courierProvider, merchantReference)` so one parcel cannot acquire
two consignment references.

## Non-destructive by construction

- No `DROP COLUMN` / `DROP TABLE` / `ALTER TYPE`.
- No column is renamed or retyped.
- Existing `OrderShipment` rows are untouched apart from two data statements
  that only fill new columns: the reconciliation cursor for already-tracked
  shipments, and the `CourierStoreMapping` backfill from `Warehouse.pathao*`.
- Both data statements are idempotent (`ON CONFLICT DO NOTHING`, guarded
  `WHERE`), so re-running them is safe.
- `Warehouse.pathao*` columns are retained and left in place. New code reads
  `CourierStoreMapping` first and falls back to the legacy columns only while a
  warehouse has no mapping row.

## Rollback

The reverse is a plain `DROP` of the new tables and columns. Because nothing
existing was modified, dropping these loses no prior data.
