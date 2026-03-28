-- AlterTable
ALTER TABLE "LeagueInvite" ADD COLUMN "lastDeliveryAttemptedAt" DATETIME;
ALTER TABLE "LeagueInvite" ADD COLUMN "lastDeliveryState" TEXT;
ALTER TABLE "LeagueInvite" ADD COLUMN "lastDeliveryErrorCode" TEXT;

-- CreateIndex
CREATE INDEX "LeagueInvite_lastDeliveryState_lastDeliveryAttemptedAt_idx" ON "LeagueInvite"("lastDeliveryState", "lastDeliveryAttemptedAt");
