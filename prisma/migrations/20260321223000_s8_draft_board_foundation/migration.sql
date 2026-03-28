-- CreateTable
CREATE TABLE "DraftOrderEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "futurePickId" TEXT,
    "originalTeamId" TEXT,
    "owningTeamId" TEXT NOT NULL,
    "selectingTeamId" TEXT NOT NULL,
    "isBonus" BOOLEAN NOT NULL DEFAULT false,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftOrderEntry_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftOrderEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftOrderEntry_futurePickId_fkey" FOREIGN KEY ("futurePickId") REFERENCES "FuturePick" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftOrderEntry_originalTeamId_fkey" FOREIGN KEY ("originalTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftOrderEntry_owningTeamId_fkey" FOREIGN KEY ("owningTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftOrderEntry_selectingTeamId_fkey" FOREIGN KEY ("selectingTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftOrderEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "draftOrderEntryId" TEXT NOT NULL,
    "futurePickId" TEXT,
    "selectingTeamId" TEXT NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "openedAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftPick_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftPick_draftOrderEntryId_fkey" FOREIGN KEY ("draftOrderEntryId") REFERENCES "DraftOrderEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftPick_futurePickId_fkey" FOREIGN KEY ("futurePickId") REFERENCES "FuturePick" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftPick_selectingTeamId_fkey" FOREIGN KEY ("selectingTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DraftSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "draftPickId" TEXT,
    "pickId" TEXT,
    "selectingTeamId" TEXT NOT NULL,
    "playerId" TEXT,
    "actedByUserId" TEXT,
    "contractId" TEXT,
    "rosterAssignmentId" TEXT,
    "round" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "salary" INTEGER,
    "contractYears" INTEGER,
    "outcome" TEXT NOT NULL DEFAULT 'SELECTED',
    "isPassed" BOOLEAN NOT NULL DEFAULT false,
    "madeAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DraftSelection_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_draftPickId_fkey" FOREIGN KEY ("draftPickId") REFERENCES "DraftPick" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "FuturePick" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_selectingTeamId_fkey" FOREIGN KEY ("selectingTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_actedByUserId_fkey" FOREIGN KEY ("actedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DraftSelection_rosterAssignmentId_fkey" FOREIGN KEY ("rosterAssignmentId") REFERENCES "RosterAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DraftSelection" (
    "id",
    "draftId",
    "draftPickId",
    "pickId",
    "selectingTeamId",
    "playerId",
    "actedByUserId",
    "contractId",
    "rosterAssignmentId",
    "round",
    "pickNumber",
    "salary",
    "contractYears",
    "outcome",
    "isPassed",
    "madeAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "draftId",
    NULL,
    "pickId",
    "selectingTeamId",
    "playerId",
    NULL,
    NULL,
    NULL,
    "round",
    "pickNumber",
    "salary",
    "contractYears",
    CASE
        WHEN "isPassed" = true THEN 'PASSED'
        ELSE 'SELECTED'
    END,
    "isPassed",
    "madeAt",
    "createdAt",
    "createdAt"
FROM "DraftSelection";
DROP TABLE "DraftSelection";
ALTER TABLE "new_DraftSelection" RENAME TO "DraftSelection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DraftOrderEntry_draftId_pickNumber_key" ON "DraftOrderEntry"("draftId", "pickNumber");

-- CreateIndex
CREATE INDEX "DraftOrderEntry_seasonId_selectingTeamId_idx" ON "DraftOrderEntry"("seasonId", "selectingTeamId");

-- CreateIndex
CREATE INDEX "DraftOrderEntry_owningTeamId_draftId_idx" ON "DraftOrderEntry"("owningTeamId", "draftId");

-- CreateIndex
CREATE INDEX "DraftOrderEntry_futurePickId_idx" ON "DraftOrderEntry"("futurePickId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_pickNumber_key" ON "DraftPick"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftOrderEntryId_key" ON "DraftPick"("draftOrderEntryId");

-- CreateIndex
CREATE INDEX "DraftPick_draftId_status_pickNumber_idx" ON "DraftPick"("draftId", "status", "pickNumber");

-- CreateIndex
CREATE INDEX "DraftPick_selectingTeamId_status_idx" ON "DraftPick"("selectingTeamId", "status");

-- CreateIndex
CREATE INDEX "DraftPick_futurePickId_idx" ON "DraftPick"("futurePickId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSelection_draftId_pickNumber_key" ON "DraftSelection"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSelection_draftPickId_key" ON "DraftSelection"("draftPickId");

-- CreateIndex
CREATE INDEX "DraftSelection_selectingTeamId_idx" ON "DraftSelection"("selectingTeamId");

-- CreateIndex
CREATE INDEX "DraftSelection_pickId_idx" ON "DraftSelection"("pickId");

-- CreateIndex
CREATE INDEX "DraftSelection_actedByUserId_idx" ON "DraftSelection"("actedByUserId");

-- CreateIndex
CREATE INDEX "DraftSelection_contractId_idx" ON "DraftSelection"("contractId");

-- CreateIndex
CREATE INDEX "DraftSelection_rosterAssignmentId_idx" ON "DraftSelection"("rosterAssignmentId");

-- CreateIndex
CREATE INDEX "DraftSelection_playerId_idx" ON "DraftSelection"("playerId");
