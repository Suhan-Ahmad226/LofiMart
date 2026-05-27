CREATE UNIQUE INDEX "ResellerCommission_resellerId_orderId_productId_key"
ON "public"."ResellerCommission"("resellerId", "orderId", "productId");
