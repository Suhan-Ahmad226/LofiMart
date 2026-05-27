ALTER TABLE "public"."Warehouse"
ADD COLUMN "insideDhakaFee" DECIMAL,
ADD COLUMN "outsideDhakaFee" DECIMAL,
ADD COLUMN "insideDhakaEta" TEXT,
ADD COLUMN "outsideDhakaEta" TEXT,
ADD COLUMN "freeShippingThresholdOverride" DECIMAL;
