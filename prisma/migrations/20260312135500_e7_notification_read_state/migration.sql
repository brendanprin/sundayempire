-- CreateTable
CREATE TABLE "NotificationReadState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationReadState_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationReadState_leagueId_actorEmail_key" ON "NotificationReadState"("leagueId", "actorEmail");

-- CreateIndex
CREATE INDEX "NotificationReadState_actorEmail_leagueId_idx" ON "NotificationReadState"("actorEmail", "leagueId");
