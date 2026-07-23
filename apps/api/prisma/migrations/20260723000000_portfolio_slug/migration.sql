-- AlterTable: add nullable slug column for readable portfolio URLs.
ALTER TABLE "portfolios" ADD COLUMN "slug" TEXT;

-- Unique per user. NULLs are allowed and do not collide in Postgres, so
-- existing rows migrate without a value; the API backfills them lazily.
CREATE UNIQUE INDEX "portfolios_userId_slug_key" ON "portfolios"("userId", "slug");
