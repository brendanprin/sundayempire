-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "auctionMode" TEXT;
ALTER TABLE "Draft" ADD COLUMN "auctionEndsAt" DATETIME;
ALTER TABLE "Draft" ADD COLUMN "auctionOpenBidWindowSeconds" INTEGER;
ALTER TABLE "Draft" ADD COLUMN "auctionBidResetSeconds" INTEGER;

-- CreateTable
CREATE TABLE "AuctionPlayerPoolEntry" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuctionPlayerPoolEntry_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_nominatedByTeamId_fkey" FOREIGN KEY ("nominatedByTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionPlayerPoolEntry_currentLeadingTeamId_fkey" FOREIGN KEY ("currentLeadingTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "poolEntryId" TEXT NOT NULL,
    "biddingTeamId" TEXT NOT NULL,
    "bidderUserId" TEXT,
    "bidType" TEXT NOT NULL,
    "salaryAmount" INTEGER NOT NULL,
    "contractYears" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuctionBid_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBid_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBid_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBid_poolEntryId_fkey" FOREIGN KEY ("poolEntryId") REFERENCES "AuctionPlayerPoolEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBid_biddingTeamId_fkey" FOREIGN KEY ("biddingTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionBid_bidderUserId_fkey" FOREIGN KEY ("bidderUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuctionAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "poolEntryId" TEXT NOT NULL,
    "winningBidId" TEXT,
    "awardedTeamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "contractId" TEXT,
    "rosterAssignmentId" TEXT,
    "salaryAmount" INTEGER NOT NULL,
    "contractYears" INTEGER NOT NULL,
    "acquisitionType" TEXT NOT NULL DEFAULT 'AUCTION',
    "status" TEXT NOT NULL DEFAULT 'FINALIZED',
    "createdByUserId" TEXT,
    "awardedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuctionAward_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_poolEntryId_fkey" FOREIGN KEY ("poolEntryId") REFERENCES "AuctionPlayerPoolEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_winningBidId_fkey" FOREIGN KEY ("winningBidId") REFERENCES "AuctionBid" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_awardedTeamId_fkey" FOREIGN KEY ("awardedTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_rosterAssignmentId_fkey" FOREIGN KEY ("rosterAssignmentId") REFERENCES "RosterAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuctionAward_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AuctionPlayerPoolEntry_draftId_playerId_key" ON "AuctionPlayerPoolEntry"("draftId", "playerId");

-- CreateIndex
CREATE INDEX "AuctionPlayerPoolEntry_draftId_status_openBidClosesAt_idx" ON "AuctionPlayerPoolEntry"("draftId", "status", "openBidClosesAt");

-- CreateIndex
CREATE INDEX "AuctionPlayerPoolEntry_draftId_status_blindBidClosesAt_idx" ON "AuctionPlayerPoolEntry"("draftId", "status", "blindBidClosesAt");

-- CreateIndex
CREATE INDEX "AuctionPlayerPoolEntry_currentLeadingTeamId_idx" ON "AuctionPlayerPoolEntry"("currentLeadingTeamId");

-- CreateIndex
CREATE INDEX "AuctionBid_poolEntryId_bidType_status_submittedAt_idx" ON "AuctionBid"("poolEntryId", "bidType", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "AuctionBid_biddingTeamId_submittedAt_idx" ON "AuctionBid"("biddingTeamId", "submittedAt");

-- CreateIndex
CREATE INDEX "AuctionBid_draftId_submittedAt_idx" ON "AuctionBid"("draftId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionAward_poolEntryId_key" ON "AuctionAward"("poolEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionAward_winningBidId_key" ON "AuctionAward"("winningBidId");

-- CreateIndex
CREATE INDEX "AuctionAward_draftId_awardedAt_idx" ON "AuctionAward"("draftId", "awardedAt");

-- CreateIndex
CREATE INDEX "AuctionAward_awardedTeamId_awardedAt_idx" ON "AuctionAward"("awardedTeamId", "awardedAt");

-- CreateIndex
CREATE INDEX "AuctionAward_playerId_idx" ON "AuctionAward"("playerId");
