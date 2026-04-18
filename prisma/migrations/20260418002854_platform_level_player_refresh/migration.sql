/*
  Warnings:

  - You are about to drop the `PlayerSeasonSnapshot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `leagueId` on the `PlayerRefreshChange` table. All the data in the column will be lost.
  - You are about to drop the column `seasonId` on the `PlayerRefreshChange` table. All the data in the column will be lost.
  - You are about to drop the column `snapshotId` on the `PlayerRefreshChange` table. All the data in the column will be lost.
  - You are about to drop the column `leagueId` on the `PlayerRefreshJob` table. All the data in the column will be lost.
  - You are about to drop the column `seasonId` on the `PlayerRefreshJob` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PlayerSeasonSnapshot_refreshJobId_playerId_key";

-- DropIndex
DROP INDEX "PlayerSeasonSnapshot_refreshJobId_idx";

-- DropIndex
DROP INDEX "PlayerSeasonSnapshot_playerId_capturedAt_idx";

-- DropIndex
DROP INDEX "PlayerSeasonSnapshot_leagueId_seasonId_playerId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PlayerSeasonSnapshot";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlayerRefreshChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "playerId" TEXT,
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
    CONSTRAINT "PlayerRefreshChange_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PlayerRefreshJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshChange_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlayerRefreshChange_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlayerRefreshChange" ("appliedValuesJson", "changeType", "createdAt", "fieldMaskJson", "id", "incomingValuesJson", "jobId", "notes", "playerId", "previousValuesJson", "reviewStatus", "reviewedAt", "reviewedByUserId", "updatedAt") SELECT "appliedValuesJson", "changeType", "createdAt", "fieldMaskJson", "id", "incomingValuesJson", "jobId", "notes", "playerId", "previousValuesJson", "reviewStatus", "reviewedAt", "reviewedByUserId", "updatedAt" FROM "PlayerRefreshChange";
DROP TABLE "PlayerRefreshChange";
ALTER TABLE "new_PlayerRefreshChange" RENAME TO "PlayerRefreshChange";
CREATE INDEX "PlayerRefreshChange_jobId_reviewStatus_idx" ON "PlayerRefreshChange"("jobId", "reviewStatus");
CREATE INDEX "PlayerRefreshChange_jobId_changeType_idx" ON "PlayerRefreshChange"("jobId", "changeType");
CREATE INDEX "PlayerRefreshChange_playerId_idx" ON "PlayerRefreshChange"("playerId");
CREATE INDEX "PlayerRefreshChange_reviewedByUserId_idx" ON "PlayerRefreshChange"("reviewedByUserId");
CREATE TABLE "new_PlayerRefreshJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestedByUserId" TEXT,
    "triggerType" TEXT NOT NULL DEFAULT 'MANUAL',
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
    CONSTRAINT "PlayerRefreshJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlayerRefreshJob" ("adapterKey", "completedAt", "createdAt", "errorJson", "id", "inputJson", "payloadDigest", "requestedByUserId", "sourceLabel", "startedAt", "status", "summaryJson", "updatedAt") SELECT "adapterKey", "completedAt", "createdAt", "errorJson", "id", "inputJson", "payloadDigest", "requestedByUserId", "sourceLabel", "startedAt", "status", "summaryJson", "updatedAt" FROM "PlayerRefreshJob";
DROP TABLE "PlayerRefreshJob";
ALTER TABLE "new_PlayerRefreshJob" RENAME TO "PlayerRefreshJob";
CREATE INDEX "PlayerRefreshJob_status_idx" ON "PlayerRefreshJob"("status");
CREATE INDEX "PlayerRefreshJob_requestedByUserId_idx" ON "PlayerRefreshJob"("requestedByUserId");
CREATE INDEX "PlayerRefreshJob_createdAt_idx" ON "PlayerRefreshJob"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
