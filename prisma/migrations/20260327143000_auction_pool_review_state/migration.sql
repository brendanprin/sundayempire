-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "auctionPoolReviewStatus" TEXT;
ALTER TABLE "Draft" ADD COLUMN "auctionPoolGeneratedAt" DATETIME;
ALTER TABLE "Draft" ADD COLUMN "auctionPoolGeneratedByUserId" TEXT;
ALTER TABLE "Draft" ADD COLUMN "auctionPoolFinalizedAt" DATETIME;
ALTER TABLE "Draft" ADD COLUMN "auctionPoolFinalizedByUserId" TEXT;

-- CreateTable
CREATE TABLE "AuctionPlayerPoolExclusion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetailsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuctionPlayerPoolExclusion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolExclusion_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolExclusion_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolExclusion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AuctionPlayerPoolExclusion_draftId_reason_idx" ON "AuctionPlayerPoolExclusion"("draftId", "reason");

-- CreateIndex
CREATE INDEX "AuctionPlayerPoolExclusion_playerId_idx" ON "AuctionPlayerPoolExclusion"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionPlayerPoolExclusion_draftId_playerId_key" ON "AuctionPlayerPoolExclusion"("draftId", "playerId");
