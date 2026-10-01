-- LOFIMART FRESH DATABASE RESET
-- DESTRUCTIVE: run ONLY against the dedicated LofiMart Supabase database.
-- Removes all public tables, indexes, foreign keys, enums and data.
-- After this succeeds, run: npx prisma migrate deploy
-- The single Prisma baseline migration will recreate the schema.

DROP SCHEMA IF EXISTS "public" CASCADE;
CREATE SCHEMA "public";
