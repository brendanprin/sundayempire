-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamSeasonState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "rosterCount" INTEGER NOT NULL DEFAULT 0,
    "activeCapTotal" INTEGER NOT NULL DEFAULT 0,
    "deadCapTotal" INTEGER NOT NULL DEFAULT 0,
    "hardCapTotal" INTEGER NOT NULL DEFAULT 0,
    "complianceStatus" TEXT,
    "lastRecalculatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamSeasonState_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamSeasonState_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "contractId" TEXT,
    "acquisitionType" TEXT NOT NULL DEFAULT 'MANUAL',
    "rosterStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hostPlatformReferenceId" TEXT,
    "effectiveAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RosterAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterAssignment_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterAssignment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_teamId_userId_membershipType_key" ON "TeamMembership"("teamId", "userId", "membershipType");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_isActive_idx" ON "TeamMembership"("teamId", "isActive");

-- CreateIndex
CREATE INDEX "TeamMembership_userId_isActive_idx" ON "TeamMembership"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSeasonState_teamId_seasonId_key" ON "TeamSeasonState"("teamId", "seasonId");

-- CreateIndex
CREATE INDEX "TeamSeasonState_seasonId_idx" ON "TeamSeasonState"("seasonId");

-- CreateIndex
CREATE INDEX "RosterAssignment_teamId_seasonId_endedAt_idx" ON "RosterAssignment"("teamId", "seasonId", "endedAt");

-- CreateIndex
CREATE INDEX "RosterAssignment_playerId_seasonId_idx" ON "RosterAssignment"("playerId", "seasonId");

-- CreateIndex
CREATE INDEX "RosterAssignment_contractId_idx" ON "RosterAssignment"("contractId");
