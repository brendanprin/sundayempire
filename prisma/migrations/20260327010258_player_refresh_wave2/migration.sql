-- CreateTable
CREATE TABLE "PlayerIdentityMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourcePlayerId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "notes" TEXT,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerIdentityMapping_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerIdentityMapping_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlayerIdentityMapping_playerId_idx" ON "PlayerIdentityMapping"("playerId");

-- CreateIndex
CREATE INDEX "PlayerIdentityMapping_approvedByUserId_idx" ON "PlayerIdentityMapping"("approvedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerIdentityMapping_sourceKey_sourcePlayerId_key" ON "PlayerIdentityMapping"("sourceKey", "sourcePlayerId");
