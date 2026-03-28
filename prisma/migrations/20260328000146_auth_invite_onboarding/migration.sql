-- CreateTable
CREATE TABLE "LeagueInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "intendedRole" TEXT NOT NULL,
    "teamId" TEXT,
    "ownerId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    "invitedByUserId" TEXT,
    CONSTRAINT "LeagueInvite_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeagueInvite_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeagueInvite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeagueInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LeagueInvite_tokenHash_key" ON "LeagueInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "LeagueInvite_leagueId_email_idx" ON "LeagueInvite"("leagueId", "email");

-- CreateIndex
CREATE INDEX "LeagueInvite_acceptedAt_revokedAt_expiresAt_idx" ON "LeagueInvite"("acceptedAt", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "LeagueInvite_teamId_idx" ON "LeagueInvite"("teamId");

-- CreateIndex
CREATE INDEX "LeagueInvite_ownerId_idx" ON "LeagueInvite"("ownerId");

-- CreateIndex
CREATE INDEX "LeagueInvite_invitedByUserId_idx" ON "LeagueInvite"("invitedByUserId");
