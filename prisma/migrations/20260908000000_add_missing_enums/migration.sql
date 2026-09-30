-- Add missing enum types (idempotent)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('customer', 'seller', 'reseller', 'admin');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM ('pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled');
  ELSE
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'processing';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'packed';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ready_for_pickup';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'pickup_requested';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'picked_up';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'in_transit';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'out_for_delivery';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'delivered';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'delivery_failed';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'returned';
    ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'cancelled';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');
  ELSE
    ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'paid';
    ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'failed';
    ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refunded';
    ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'partially_refunded';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ShipmentStatus') THEN
    CREATE TYPE "ShipmentStatus" AS ENUM ('pending', 'processing', 'packed', 'ready_for_pickup', 'pickup_requested', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled');
  ELSE
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'processing';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'packed';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'ready_for_pickup';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'pickup_requested';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'picked_up';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'in_transit';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'out_for_delivery';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'delivered';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'delivery_failed';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'returned';
    ALTER TYPE "ShipmentStatus" ADD VALUE IF NOT EXISTS 'cancelled';
  END IF;
END $$;

-- Alter columns to use the new enum types
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING ("status"::text::"OrderStatus");
ALTER TABLE "Order" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus" USING ("paymentStatus"::text::"PaymentStatus");
ALTER TABLE "OrderShipment" ALTER COLUMN "status" TYPE "ShipmentStatus" USING ("status"::text::"ShipmentStatus");