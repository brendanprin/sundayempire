-- CreateTable
CREATE TABLE "LeagueDeadline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "deadlineType" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "sourceType" TEXT NOT NULL,
    "reminderOffsetsJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeagueDeadline_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeagueDeadline_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaguePhaseTransition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "fromPhase" TEXT NOT NULL,
    "toPhase" TEXT NOT NULL,
    "initiatedByUserId" TEXT,
    "initiatedByType" TEXT NOT NULL,
    "reason" TEXT,
    "transitionStatus" TEXT NOT NULL DEFAULT 'SUCCESS',
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaguePhaseTransition_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeaguePhaseTransition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeaguePhaseTransition_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "phase" TEXT NOT NULL DEFAULT 'PRESEASON_SETUP',
    "openedAt" DATETIME,
    "closedAt" DATETIME,
    "sourceSeasonId" TEXT,
    "regularSeasonWeeks" INTEGER NOT NULL DEFAULT 13,
    "playoffStartWeek" INTEGER NOT NULL DEFAULT 14,
    "playoffEndWeek" INTEGER NOT NULL DEFAULT 16,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Season_sourceSeasonId_fkey" FOREIGN KEY ("sourceSeasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Season" ("createdAt", "id", "leagueId", "status", "phase", "openedAt", "playoffEndWeek", "playoffStartWeek", "regularSeasonWeeks", "updatedAt", "year")
SELECT
    "createdAt",
    "id",
    "leagueId",
    'ACTIVE',
    CASE "phase"
        WHEN 'PRESEASON' THEN 'PRESEASON_SETUP'
        WHEN 'REGULAR_SEASON' THEN 'REGULAR_SEASON'
        WHEN 'PLAYOFFS' THEN 'PLAYOFFS'
        WHEN 'OFFSEASON' THEN 'OFFSEASON_ROLLOVER'
        ELSE 'PRESEASON_SETUP'
    END,
    "createdAt",
    "playoffEndWeek",
    "playoffStartWeek",
    "regularSeasonWeeks",
    "updatedAt",
    "year"
FROM "Season";
DROP TABLE "Season";
ALTER TABLE "new_Season" RENAME TO "Season";
CREATE INDEX "Season_leagueId_status_idx" ON "Season"("leagueId", "status");
CREATE INDEX "Season_sourceSeasonId_idx" ON "Season"("sourceSeasonId");
CREATE UNIQUE INDEX "Season_leagueId_year_key" ON "Season"("leagueId", "year");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LeagueDeadline_leagueId_seasonId_phase_idx" ON "LeagueDeadline"("leagueId", "seasonId", "phase");

-- CreateIndex
CREATE INDEX "LeagueDeadline_scheduledAt_idx" ON "LeagueDeadline"("scheduledAt");

-- CreateIndex
CREATE INDEX "LeaguePhaseTransition_leagueId_seasonId_idx" ON "LeaguePhaseTransition"("leagueId", "seasonId");

-- CreateIndex
CREATE INDEX "LeaguePhaseTransition_occurredAt_idx" ON "LeaguePhaseTransition"("occurredAt");

-- CreateIndex
CREATE INDEX "LeaguePhaseTransition_initiatedByUserId_idx" ON "LeaguePhaseTransition"("initiatedByUserId");
