-- CreateTable
CREATE TABLE "PlayerRefreshJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "adapterKey" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "payloadDigest" TEXT,
    "inputJson" JSONB,
    "summaryJson" JSONB,
    "errorJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerRefreshJob_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshJob_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerSeasonSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "refreshJobId" TEXT,
    "sourceKey" TEXT,
    "sourcePlayerId" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "searchName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "nflTeam" TEXT,
    "age" INTEGER,
    "yearsPro" INTEGER,
    "injuryStatus" TEXT,
    "statusCode" TEXT,
    "statusText" TEXT,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerSeasonSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerSeasonSnapshot_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerSeasonSnapshot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerSeasonSnapshot_refreshJobId_fkey" FOREIGN KEY ("refreshJobId") REFERENCES "PlayerRefreshJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerRefreshChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "playerId" TEXT,
    "snapshotId" TEXT,
    "changeType" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "fieldMaskJson" JSONB,
    "previousValuesJson" JSONB,
    "incomingValuesJson" JSONB,
    "appliedValuesJson" JSONB,
    "notes" TEXT,
    "reviewedAt" DATETIME,
    "reviewedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerRefreshChange_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshChange_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshChange_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PlayerRefreshJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshChange_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshChange_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PlayerSeasonSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshChange_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "sourceKey" TEXT,
    "sourcePlayerId" TEXT,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "searchName" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL,
    "nflTeam" TEXT,
    "age" INTEGER,
    "yearsPro" INTEGER,
    "injuryStatus" TEXT,
    "statusCode" TEXT,
    "statusText" TEXT,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Player" (
    "age",
    "createdAt",
    "displayName",
    "externalId",
    "id",
    "injuryStatus",
    "isRestricted",
    "name",
    "nflTeam",
    "position",
    "searchName",
    "updatedAt",
    "yearsPro"
)
SELECT
    "age",
    "createdAt",
    TRIM("name"),
    "externalId",
    "id",
    "injuryStatus",
    "isRestricted",
    "name",
    "nflTeam",
    "position",
    LOWER(TRIM("name")),
    "updatedAt",
    "yearsPro"
FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE UNIQUE INDEX "Player_externalId_key" ON "Player"("externalId");
CREATE INDEX "Player_searchName_idx" ON "Player"("searchName");
CREATE UNIQUE INDEX "Player_sourceKey_sourcePlayerId_key" ON "Player"("sourceKey", "sourcePlayerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PlayerRefreshJob_leagueId_seasonId_status_idx" ON "PlayerRefreshJob"("leagueId", "seasonId", "status");

-- CreateIndex
CREATE INDEX "PlayerRefreshJob_requestedByUserId_idx" ON "PlayerRefreshJob"("requestedByUserId");

-- CreateIndex
CREATE INDEX "PlayerRefreshJob_createdAt_idx" ON "PlayerRefreshJob"("createdAt");

-- CreateIndex
CREATE INDEX "PlayerSeasonSnapshot_leagueId_seasonId_playerId_idx" ON "PlayerSeasonSnapshot"("leagueId", "seasonId", "playerId");

-- CreateIndex
CREATE INDEX "PlayerSeasonSnapshot_playerId_capturedAt_idx" ON "PlayerSeasonSnapshot"("playerId", "capturedAt");

-- CreateIndex
CREATE INDEX "PlayerSeasonSnapshot_refreshJobId_idx" ON "PlayerSeasonSnapshot"("refreshJobId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSeasonSnapshot_refreshJobId_playerId_key" ON "PlayerSeasonSnapshot"("refreshJobId", "playerId");

-- CreateIndex
CREATE INDEX "PlayerRefreshChange_leagueId_seasonId_reviewStatus_idx" ON "PlayerRefreshChange"("leagueId", "seasonId", "reviewStatus");

-- CreateIndex
CREATE INDEX "PlayerRefreshChange_jobId_changeType_idx" ON "PlayerRefreshChange"("jobId", "changeType");

-- CreateIndex
CREATE INDEX "PlayerRefreshChange_playerId_idx" ON "PlayerRefreshChange"("playerId");

-- CreateIndex
CREATE INDEX "PlayerRefreshChange_snapshotId_idx" ON "PlayerRefreshChange"("snapshotId");

-- CreateIndex
CREATE INDEX "PlayerRefreshChange_reviewedByUserId_idx" ON "PlayerRefreshChange"("reviewedByUserId");
