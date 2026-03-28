CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "teamId" TEXT,
    "relatedTeamId" TEXT,
    "playerId" TEXT,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "dedupeKey" TEXT,
    "payload" JSONB,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_relatedTeamId_fkey" FOREIGN KEY ("relatedTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ActivityEvent_dedupeKey_key" ON "ActivityEvent"("dedupeKey");
CREATE INDEX "ActivityEvent_leagueId_seasonId_occurredAt_idx" ON "ActivityEvent"("leagueId", "seasonId", "occurredAt");
CREATE INDEX "ActivityEvent_leagueId_eventType_occurredAt_idx" ON "ActivityEvent"("leagueId", "eventType", "occurredAt");
CREATE INDEX "ActivityEvent_teamId_occurredAt_idx" ON "ActivityEvent"("teamId", "occurredAt");
CREATE INDEX "ActivityEvent_relatedTeamId_occurredAt_idx" ON "ActivityEvent"("relatedTeamId", "occurredAt");
CREATE INDEX "ActivityEvent_playerId_occurredAt_idx" ON "ActivityEvent"("playerId", "occurredAt");
CREATE INDEX "ActivityEvent_actorUserId_occurredAt_idx" ON "ActivityEvent"("actorUserId", "occurredAt");
CREATE INDEX "ActivityEvent_sourceEntityType_sourceEntityId_idx" ON "ActivityEvent"("sourceEntityType", "sourceEntityId");
