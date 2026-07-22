-- DropIndex
DROP INDEX "alerts_status_idx";

-- CreateIndex
CREATE INDEX "alerts_status_exchange_idx" ON "alerts"("status", "exchange");
