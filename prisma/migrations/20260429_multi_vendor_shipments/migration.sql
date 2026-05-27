CREATE TABLE IF NOT EXISTS "OrderShipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "total" DECIMAL(65,30) NOT NULL,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "courierProvider" TEXT,
  "trackingId" TEXT,
  "pickupRequestedAt" TIMESTAMP(3),
  "pickedUpAt" TIMESTAMP(3),
  "outForDeliveryAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "deliveryFailureReason" TEXT,
  "shipmentMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderShipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderShipmentItem" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "price" DECIMAL(65,30) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderShipmentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrderShipmentItem_orderItemId_key" ON "OrderShipmentItem"("orderItemId");
CREATE INDEX IF NOT EXISTS "OrderShipment_orderId_createdAt_idx" ON "OrderShipment"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderShipment_sellerId_status_createdAt_idx" ON "OrderShipment"("sellerId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderShipment_warehouseId_status_createdAt_idx" ON "OrderShipment"("warehouseId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderShipmentItem_shipmentId_createdAt_idx" ON "OrderShipmentItem"("shipmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderShipmentItem_productId_idx" ON "OrderShipmentItem"("productId");

ALTER TABLE "OrderShipment"
  ADD CONSTRAINT "OrderShipment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderShipment"
  ADD CONSTRAINT "OrderShipment_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderShipment"
  ADD CONSTRAINT "OrderShipment_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderShipmentItem"
  ADD CONSTRAINT "OrderShipmentItem_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES "OrderShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderShipmentItem"
  ADD CONSTRAINT "OrderShipmentItem_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderShipmentItem"
  ADD CONSTRAINT "OrderShipmentItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
