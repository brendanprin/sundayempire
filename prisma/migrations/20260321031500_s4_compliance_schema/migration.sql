-- CreateTable
CREATE TABLE "ComplianceIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT,
    "playerId" TEXT,
    "contractId" TEXT,
    "leagueDeadlineId" TEXT,
    "createdByUserId" TEXT,
    "source" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "code" TEXT NOT NULL,
    "ruleCode" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "dueAt" DATETIME,
    "dueAtBasis" TEXT,
    "dueAtReason" TEXT,
    "resolvedAt" DATETIME,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComplianceIssue_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComplianceIssue_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComplianceIssue_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ComplianceIssue_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ComplianceIssue_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ComplianceIssue_leagueDeadlineId_fkey" FOREIGN KEY ("leagueDeadlineId") REFERENCES "LeagueDeadline" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ComplianceIssue_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRoleSnapshot" TEXT,
    "actionType" TEXT NOT NULL,
    "toStatus" TEXT,
    "summary" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceAction_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ComplianceIssue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComplianceAction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommissionerOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT,
    "issueId" TEXT,
    "complianceActionId" TEXT,
    "actorUserId" TEXT,
    "actorRoleSnapshot" TEXT,
    "overrideType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "reason" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommissionerOverride_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommissionerOverride_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommissionerOverride_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommissionerOverride_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ComplianceIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommissionerOverride_complianceActionId_fkey" FOREIGN KEY ("complianceActionId") REFERENCES "ComplianceAction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CommissionerOverride_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT,
    "recipientUserId" TEXT NOT NULL,
    "teamId" TEXT,
    "issueId" TEXT,
    "actionId" TEXT,
    "overrideId" TEXT,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ComplianceIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ComplianceAction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "CommissionerOverride" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ComplianceIssue_leagueId_seasonId_status_severity_idx" ON "ComplianceIssue"("leagueId", "seasonId", "status", "severity");

-- CreateIndex
CREATE INDEX "ComplianceIssue_teamId_status_dueAt_idx" ON "ComplianceIssue"("teamId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ComplianceIssue_fingerprint_status_idx" ON "ComplianceIssue"("fingerprint", "status");

-- CreateIndex
CREATE INDEX "ComplianceIssue_leagueDeadlineId_idx" ON "ComplianceIssue"("leagueDeadlineId");

-- CreateIndex
CREATE INDEX "ComplianceAction_issueId_createdAt_idx" ON "ComplianceAction"("issueId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceAction_actorUserId_createdAt_idx" ON "ComplianceAction"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionerOverride_complianceActionId_key" ON "CommissionerOverride"("complianceActionId");

-- CreateIndex
CREATE INDEX "CommissionerOverride_leagueId_seasonId_createdAt_idx" ON "CommissionerOverride"("leagueId", "seasonId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionerOverride_teamId_createdAt_idx" ON "CommissionerOverride"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionerOverride_issueId_idx" ON "CommissionerOverride"("issueId");

-- CreateIndex
CREATE INDEX "CommissionerOverride_overrideType_createdAt_idx" ON "CommissionerOverride"("overrideType", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_leagueId_createdAt_idx" ON "Notification"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_teamId_createdAt_idx" ON "Notification"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_issueId_idx" ON "Notification"("issueId");

-- CreateIndex
CREATE INDEX "Notification_overrideId_idx" ON "Notification"("overrideId");
