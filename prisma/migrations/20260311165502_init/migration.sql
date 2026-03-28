-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'PRESEASON',
    "regularSeasonWeeks" INTEGER NOT NULL DEFAULT 13,
    "playoffStartWeek" INTEGER NOT NULL DEFAULT 14,
    "playoffEndWeek" INTEGER NOT NULL DEFAULT 16,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "divisionLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflTeam" TEXT,
    "age" INTEGER,
    "yearsPro" INTEGER,
    "injuryStatus" TEXT,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LeagueRuleSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL,
    "effectiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "rosterSize" INTEGER NOT NULL DEFAULT 17,
    "starterQb" INTEGER NOT NULL DEFAULT 1,
    "starterQbFlex" INTEGER NOT NULL DEFAULT 1,
    "starterRb" INTEGER NOT NULL DEFAULT 2,
    "starterWr" INTEGER NOT NULL DEFAULT 3,
    "starterTe" INTEGER NOT NULL DEFAULT 1,
    "starterFlex" INTEGER NOT NULL DEFAULT 1,
    "starterDst" INTEGER NOT NULL DEFAULT 1,
    "irSlots" INTEGER NOT NULL DEFAULT 2,
    "salaryCapSoft" INTEGER NOT NULL DEFAULT 245,
    "salaryCapHard" INTEGER NOT NULL DEFAULT 300,
    "waiverBidMaxAtOrAboveSoftCap" INTEGER NOT NULL DEFAULT 0,
    "minContractYears" INTEGER NOT NULL DEFAULT 1,
    "maxContractYears" INTEGER NOT NULL DEFAULT 4,
    "minSalary" INTEGER NOT NULL DEFAULT 1,
    "maxContractYearsIfSalaryBelowTen" INTEGER NOT NULL DEFAULT 3,
    "rookieBaseYears" INTEGER NOT NULL DEFAULT 1,
    "rookieOptionYears" INTEGER NOT NULL DEFAULT 2,
    "franchiseTagsPerTeam" INTEGER NOT NULL DEFAULT 1,
    "tradeDeadlineWeek" INTEGER NOT NULL DEFAULT 11,
    "regularSeasonWeeks" INTEGER NOT NULL DEFAULT 13,
    "playoffStartWeek" INTEGER NOT NULL DEFAULT 14,
    "playoffEndWeek" INTEGER NOT NULL DEFAULT 16,
    CONSTRAINT "LeagueRuleSet_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "slotType" TEXT NOT NULL,
    "slotLabel" TEXT,
    "week" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RosterSlot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "salary" INTEGER NOT NULL,
    "yearsTotal" INTEGER NOT NULL,
    "yearsRemaining" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "isRookieContract" BOOLEAN NOT NULL DEFAULT false,
    "rookieOptionEligible" BOOLEAN NOT NULL DEFAULT false,
    "rookieOptionExercised" BOOLEAN NOT NULL DEFAULT false,
    "isFranchiseTag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contract_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contract_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CapPenalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CapPenalty_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CapPenalty_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CapPenalty_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "title" TEXT NOT NULL,
    "currentPickIndex" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Draft_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Draft_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FuturePick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonYear" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "overall" INTEGER,
    "originalTeamId" TEXT NOT NULL,
    "currentTeamId" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FuturePick_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FuturePick_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FuturePick_currentTeamId_fkey" FOREIGN KEY ("currentTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "pickId" TEXT,
    "selectingTeamId" TEXT NOT NULL,
    "playerId" TEXT,
    "round" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "salary" INTEGER,
    "contractYears" INTEGER,
    "isPassed" BOOLEAN NOT NULL DEFAULT false,
    "madeAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DraftSelection_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "FuturePick" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_selectingTeamId_fkey" FOREIGN KEY ("selectingTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamAId" TEXT NOT NULL,
    "teamBId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "proposedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trade_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "playerId" TEXT,
    "futurePickId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeAsset_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_futurePickId_fkey" FOREIGN KEY ("futurePickId") REFERENCES "FuturePick" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT,
    "playerId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Season_leagueId_year_key" ON "Season"("leagueId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Player_externalId_key" ON "Player"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueRuleSet_leagueId_version_key" ON "LeagueRuleSet"("leagueId", "version");

-- CreateIndex
CREATE INDEX "RosterSlot_seasonId_teamId_idx" ON "RosterSlot"("seasonId", "teamId");

-- CreateIndex
CREATE INDEX "RosterSlot_teamId_slotType_idx" ON "RosterSlot"("teamId", "slotType");

-- CreateIndex
CREATE INDEX "RosterSlot_playerId_idx" ON "RosterSlot"("playerId");

-- CreateIndex
CREATE INDEX "Contract_teamId_yearsRemaining_idx" ON "Contract"("teamId", "yearsRemaining");

-- CreateIndex
CREATE INDEX "Contract_playerId_idx" ON "Contract"("playerId");

-- CreateIndex
CREATE INDEX "CapPenalty_teamId_seasonId_idx" ON "CapPenalty"("teamId", "seasonId");

-- CreateIndex
CREATE INDEX "FuturePick_currentTeamId_seasonYear_idx" ON "FuturePick"("currentTeamId", "seasonYear");

-- CreateIndex
CREATE UNIQUE INDEX "FuturePick_leagueId_seasonYear_round_originalTeamId_key" ON "FuturePick"("leagueId", "seasonYear", "round", "originalTeamId");

-- CreateIndex
CREATE INDEX "DraftSelection_selectingTeamId_idx" ON "DraftSelection"("selectingTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSelection_draftId_pickNumber_key" ON "DraftSelection"("draftId", "pickNumber");

-- CreateIndex
CREATE INDEX "Trade_seasonId_status_idx" ON "Trade"("seasonId", "status");

-- CreateIndex
CREATE INDEX "TradeAsset_tradeId_idx" ON "TradeAsset"("tradeId");

-- CreateIndex
CREATE INDEX "TradeAsset_fromTeamId_toTeamId_idx" ON "TradeAsset"("fromTeamId", "toTeamId");

-- CreateIndex
CREATE INDEX "Transaction_seasonId_createdAt_idx" ON "Transaction"("seasonId", "createdAt");
