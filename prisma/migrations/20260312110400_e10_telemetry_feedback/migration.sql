-- CreateTable
CREATE TABLE "PilotEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "actorTeamId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventCategory" TEXT NOT NULL,
    "eventStep" TEXT,
    "status" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "pagePath" TEXT,
    "requestPath" TEXT,
    "requestMethod" TEXT,
    "context" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PilotEvent_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PilotEvent_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PilotFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "actorTeamId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "pageTitle" TEXT,
    "message" TEXT NOT NULL,
    "stepsToReproduce" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PilotFeedback_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PilotFeedback_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PilotEvent_leagueId_createdAt_idx" ON "PilotEvent"("leagueId", "createdAt");

-- CreateIndex
CREATE INDEX "PilotEvent_leagueId_eventCategory_createdAt_idx" ON "PilotEvent"("leagueId", "eventCategory", "createdAt");

-- CreateIndex
CREATE INDEX "PilotEvent_leagueId_eventType_createdAt_idx" ON "PilotEvent"("leagueId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "PilotFeedback_leagueId_status_createdAt_idx" ON "PilotFeedback"("leagueId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PilotFeedback_leagueId_category_createdAt_idx" ON "PilotFeedback"("leagueId", "category", "createdAt");

-- CreateIndex
CREATE INDEX "PilotFeedback_actorEmail_createdAt_idx" ON "PilotFeedback"("actorEmail", "createdAt");
