-- CreateTable
CREATE TABLE "HostPlatformSyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "sourceSnapshotAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "payloadDigest" TEXT,
    "inputJson" JSONB,
    "summaryJson" JSONB,
    "errorJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HostPlatformSyncJob_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HostPlatformSyncJob_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HostPlatformSyncJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncMismatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "teamId" TEXT,
    "playerId" TEXT,
    "rosterAssignmentId" TEXT,
    "complianceIssueId" TEXT,
    "mismatchType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionType" TEXT,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "hostPlatformReferenceId" TEXT,
    "hostValueJson" JSONB,
    "dynastyValueJson" JSONB,
    "metadataJson" JSONB,
    "detectionCount" INTEGER NOT NULL DEFAULT 1,
    "firstDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedByUserId" TEXT,
    "resolutionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncMismatch_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncMismatch_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncMismatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "HostPlatformSyncJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SyncMismatch_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncMismatch_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncMismatch_rosterAssignmentId_fkey" FOREIGN KEY ("rosterAssignmentId") REFERENCES "RosterAssignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncMismatch_complianceIssueId_fkey" FOREIGN KEY ("complianceIssueId") REFERENCES "ComplianceIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SyncMismatch_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HostPlatformSyncJob_leagueId_seasonId_jobType_status_createdAt_idx" ON "HostPlatformSyncJob"("leagueId", "seasonId", "jobType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HostPlatformSyncJob_requestedByUserId_createdAt_idx" ON "HostPlatformSyncJob"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "HostPlatformSyncJob_status_createdAt_idx" ON "HostPlatformSyncJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HostPlatformSyncJob_adapterKey_createdAt_idx" ON "HostPlatformSyncJob"("adapterKey", "createdAt");

-- CreateIndex
CREATE INDEX "SyncMismatch_leagueId_seasonId_status_severity_lastDetectedAt_idx" ON "SyncMismatch"("leagueId", "seasonId", "status", "severity", "lastDetectedAt");

-- CreateIndex
CREATE INDEX "SyncMismatch_jobId_severity_idx" ON "SyncMismatch"("jobId", "severity");

-- CreateIndex
CREATE INDEX "SyncMismatch_teamId_status_severity_idx" ON "SyncMismatch"("teamId", "status", "severity");

-- CreateIndex
CREATE INDEX "SyncMismatch_playerId_status_severity_idx" ON "SyncMismatch"("playerId", "status", "severity");

-- CreateIndex
CREATE INDEX "SyncMismatch_fingerprint_status_idx" ON "SyncMismatch"("fingerprint", "status");

-- CreateIndex
CREATE INDEX "SyncMismatch_rosterAssignmentId_idx" ON "SyncMismatch"("rosterAssignmentId");

-- CreateIndex
CREATE INDEX "SyncMismatch_complianceIssueId_idx" ON "SyncMismatch"("complianceIssueId");
