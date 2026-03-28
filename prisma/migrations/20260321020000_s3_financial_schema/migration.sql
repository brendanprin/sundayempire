-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Contract" ADD COLUMN "endedAt" DATETIME;

-- CreateTable
CREATE TABLE "ContractSeasonLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "annualSalary" INTEGER NOT NULL,
    "yearsRemainingAtStart" INTEGER NOT NULL,
    "ledgerStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractSeasonLedger_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractSeasonLedger_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FranchiseTagUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "priorSalary" INTEGER NOT NULL,
    "calculatedTopTierAverage" INTEGER NOT NULL,
    "calculated120PercentSalary" INTEGER NOT NULL,
    "finalTagSalary" INTEGER NOT NULL,
    "frozenSnapshotSeasonId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FranchiseTagUsage_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FranchiseTagUsage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FranchiseTagUsage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FranchiseTagUsage_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FranchiseTagUsage_frozenSnapshotSeasonId_fkey" FOREIGN KEY ("frozenSnapshotSeasonId") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FranchiseTagUsage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractOptionDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "decisionType" TEXT NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" DATETIME,
    "effectiveContractYearsAdded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractOptionDecision_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractOptionDecision_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractOptionDecision_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractOptionDecision_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractOptionDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeadCapCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "sourceContractId" TEXT NOT NULL,
    "sourceEventType" TEXT NOT NULL,
    "appliesToSeasonId" TEXT NOT NULL,
    "systemCalculatedAmount" INTEGER NOT NULL,
    "adjustedAmount" INTEGER,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeadCapCharge_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadCapCharge_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadCapCharge_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadCapCharge_sourceContractId_fkey" FOREIGN KEY ("sourceContractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadCapCharge_appliesToSeasonId_fkey" FOREIGN KEY ("appliesToSeasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeadCapCharge_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Contract_seasonId_status_idx" ON "Contract"("seasonId", "status");

-- CreateIndex
CREATE INDEX "Contract_teamId_status_idx" ON "Contract"("teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSeasonLedger_contractId_seasonId_key" ON "ContractSeasonLedger"("contractId", "seasonId");

-- CreateIndex
CREATE INDEX "ContractSeasonLedger_seasonId_idx" ON "ContractSeasonLedger"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseTagUsage_seasonId_teamId_key" ON "FranchiseTagUsage"("seasonId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseTagUsage_seasonId_contractId_key" ON "FranchiseTagUsage"("seasonId", "contractId");

-- CreateIndex
CREATE INDEX "FranchiseTagUsage_playerId_seasonId_idx" ON "FranchiseTagUsage"("playerId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractOptionDecision_seasonId_contractId_key" ON "ContractOptionDecision"("seasonId", "contractId");

-- CreateIndex
CREATE INDEX "ContractOptionDecision_teamId_seasonId_idx" ON "ContractOptionDecision"("teamId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "DeadCapCharge_sourceContractId_appliesToSeasonId_sourceEventType_key" ON "DeadCapCharge"("sourceContractId", "appliesToSeasonId", "sourceEventType");

-- CreateIndex
CREATE INDEX "DeadCapCharge_teamId_appliesToSeasonId_idx" ON "DeadCapCharge"("teamId", "appliesToSeasonId");

-- CreateIndex
CREATE INDEX "DeadCapCharge_leagueId_appliesToSeasonId_idx" ON "DeadCapCharge"("leagueId", "appliesToSeasonId");
