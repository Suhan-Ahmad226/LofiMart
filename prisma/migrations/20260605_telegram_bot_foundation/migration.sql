ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT,
  ADD COLUMN IF NOT EXISTS "telegramLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramChatId_key"
  ON "public"."User"("telegramChatId");

ALTER TABLE "public"."Invoice"
  ADD COLUMN IF NOT EXISTS "invoiceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "documentUrl" TEXT;
