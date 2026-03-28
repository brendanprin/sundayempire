-- CreateTable
CREATE TABLE "AuctionBlindTieResolution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "poolEntryId" TEXT NOT NULL,
    "tiedBidIds" TEXT NOT NULL,
    "drawSeed" TEXT NOT NULL,
    "drawResult" TEXT NOT NULL,
    "winningBidId" TEXT NOT NULL,
    "resolvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedByUserId" TEXT,
    CONSTRAINT "AuctionBlindTieResolution_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBlindTieResolution_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBlindTieResolution_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBlindTieResolution_poolEntryId_fkey" FOREIGN KEY ("poolEntryId") REFERENCES "AuctionPlayerPoolEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBlindTieResolution_winningBidId_fkey" FOREIGN KEY ("winningBidId") REFERENCES "AuctionBid" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBlindTieResolution_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuctionPlayerPoolEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "nominatedByTeamId" TEXT,
    "openedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ELIGIBLE',
    "blindEligibleAt" DATETIME,
    "blindConvertedAt" DATETIME,
    "openBiddingOpenedAt" DATETIME,
    "openBidClosesAt" DATETIME,
    "blindBiddingOpenedAt" DATETIME,
    "blindBidClosesAt" DATETIME,
    "currentLeadingBidAmount" INTEGER,
    "currentLeadingTeamId" TEXT,
    "awardedAt" DATETIME,
    "blindEligibleTeamIds" TEXT,
    "leadHistoryJson" TEXT,
    "reopenedAt" DATETIME,
    "reopenedByUserId" TEXT,
    "reopenReason" TEXT,
    "previousStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuctionPlayerPoolEntry_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_nominatedByTeamId_fkey" FOREIGN KEY ("nominatedByTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_currentLeadingTeamId_fkey" FOREIGN KEY ("currentLeadingTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuctionPlayerPoolEntry" ("awardedAt", "blindBidClosesAt", "blindBiddingOpenedAt", "blindConvertedAt", "blindEligibleAt", "createdAt", "currentLeadingBidAmount", "currentLeadingTeamId", "draftId", "id", "leagueId", "nominatedByTeamId", "openBidClosesAt", "openBiddingOpenedAt", "openedByUserId", "playerId", "seasonId", "status", "updatedAt") SELECT "awardedAt", "blindBidClosesAt", "blindBiddingOpenedAt", "blindConvertedAt", "blindEligibleAt", "createdAt", "currentLeadingBidAmount", "currentLeadingTeamId", "draftId", "id", "leagueId", "nominatedByTeamId", "openBidClosesAt", "openBiddingOpenedAt", "openedByUserId", "playerId", "seasonId", "status", "updatedAt" FROM "AuctionPlayerPoolEntry";
DROP TABLE "AuctionPlayerPoolEntry";
ALTER TABLE "new_AuctionPlayerPoolEntry" RENAME TO "AuctionPlayerPoolEntry";
CREATE INDEX "AuctionPlayerPoolEntry_draftId_status_openBidClosesAt_idx" ON "AuctionPlayerPoolEntry"("draftId", "status", "openBidClosesAt");
CREATE INDEX "AuctionPlayerPoolEntry_draftId_status_blindBidClosesAt_idx" ON "AuctionPlayerPoolEntry"("draftId", "status", "blindBidClosesAt");
CREATE INDEX "AuctionPlayerPoolEntry_currentLeadingTeamId_idx" ON "AuctionPlayerPoolEntry"("currentLeadingTeamId");
CREATE UNIQUE INDEX "AuctionPlayerPoolEntry_draftId_playerId_key" ON "AuctionPlayerPoolEntry"("draftId", "playerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "AuctionBlindTieResolution_winningBidId_key" ON "AuctionBlindTieResolution"("winningBidId");

-- CreateIndex
CREATE INDEX "AuctionBlindTieResolution_draftId_resolvedAt_idx" ON "AuctionBlindTieResolution"("draftId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionBlindTieResolution_poolEntryId_key" ON "AuctionBlindTieResolution"("poolEntryId");
