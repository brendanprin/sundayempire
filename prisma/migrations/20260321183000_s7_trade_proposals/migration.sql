-- CreateTable
CREATE TABLE "TradeProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "proposerTeamId" TEXT NOT NULL,
    "counterpartyTeamId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "submittedByUserId" TEXT,
    "counterpartyRespondedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedAt" DATETIME,
    "counterpartyRespondedAt" DATETIME,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeProposal_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeProposal_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeProposal_proposerTeamId_fkey" FOREIGN KEY ("proposerTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeProposal_counterpartyTeamId_fkey" FOREIGN KEY ("counterpartyTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeProposal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeProposal_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TradeProposal_counterpartyRespondedByUserId_fkey" FOREIGN KEY ("counterpartyRespondedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TradeProposal_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TradeAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT,
    "tradeProposalId" TEXT,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "playerId" TEXT,
    "futurePickId" TEXT,
    "contractId" TEXT,
    "assetOrder" INTEGER NOT NULL DEFAULT 0,
    "snapshotLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeAsset_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_tradeProposalId_fkey" FOREIGN KEY ("tradeProposalId") REFERENCES "TradeProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_fromTeamId_fkey" FOREIGN KEY ("fromTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_toTeamId_fkey" FOREIGN KEY ("toTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_futurePickId_fkey" FOREIGN KEY ("futurePickId") REFERENCES "FuturePick" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TradeAsset_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TradeAsset" (
    "id",
    "tradeId",
    "fromTeamId",
    "toTeamId",
    "assetType",
    "playerId",
    "futurePickId",
    "contractId",
    "assetOrder",
    "snapshotLabel",
    "createdAt"
)
SELECT
    "id",
    "tradeId",
    "fromTeamId",
    "toTeamId",
    "assetType",
    "playerId",
    "futurePickId",
    NULL,
    0,
    NULL,
    "createdAt"
FROM "TradeAsset";
DROP TABLE "TradeAsset";
ALTER TABLE "new_TradeAsset" RENAME TO "TradeAsset";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "TradeEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "trigger" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "isSubmissionSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "assetFingerprint" TEXT NOT NULL,
    "findingsJson" JSONB NOT NULL,
    "remediationJson" JSONB,
    "postTradeProjectionJson" JSONB NOT NULL,
    "evaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeEvaluation_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeEvaluation_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeEvaluation_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TradeEvaluation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TradeProposal_leagueId_seasonId_status_idx" ON "TradeProposal"("leagueId", "seasonId", "status");

-- CreateIndex
CREATE INDEX "TradeProposal_proposerTeamId_updatedAt_idx" ON "TradeProposal"("proposerTeamId", "updatedAt");

-- CreateIndex
CREATE INDEX "TradeProposal_counterpartyTeamId_updatedAt_idx" ON "TradeProposal"("counterpartyTeamId", "updatedAt");

-- CreateIndex
CREATE INDEX "TradeProposal_status_updatedAt_idx" ON "TradeProposal"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TradeAsset_tradeId_assetOrder_idx" ON "TradeAsset"("tradeId", "assetOrder");

-- CreateIndex
CREATE INDEX "TradeAsset_tradeProposalId_assetOrder_idx" ON "TradeAsset"("tradeProposalId", "assetOrder");

-- CreateIndex
CREATE INDEX "TradeAsset_fromTeamId_toTeamId_idx" ON "TradeAsset"("fromTeamId", "toTeamId");

-- CreateIndex
CREATE INDEX "TradeAsset_playerId_idx" ON "TradeAsset"("playerId");

-- CreateIndex
CREATE INDEX "TradeAsset_futurePickId_idx" ON "TradeAsset"("futurePickId");

-- CreateIndex
CREATE INDEX "TradeAsset_contractId_idx" ON "TradeAsset"("contractId");

-- CreateIndex
CREATE INDEX "TradeEvaluation_proposalId_isCurrent_idx" ON "TradeEvaluation"("proposalId", "isCurrent");

-- CreateIndex
CREATE INDEX "TradeEvaluation_leagueId_seasonId_outcome_idx" ON "TradeEvaluation"("leagueId", "seasonId", "outcome");

-- CreateIndex
CREATE INDEX "TradeEvaluation_evaluatedAt_idx" ON "TradeEvaluation"("evaluatedAt");
