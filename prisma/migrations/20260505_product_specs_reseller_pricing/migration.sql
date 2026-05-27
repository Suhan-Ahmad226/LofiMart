ALTER TABLE "public"."Product"
ADD COLUMN "specifications" JSONB,
ADD COLUMN "resellerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resellerBasePrice" DECIMAL(65,30),
ADD COLUMN "resellerSuggestedPrice" DECIMAL(65,30),
ADD COLUMN "resellerNotes" TEXT;
