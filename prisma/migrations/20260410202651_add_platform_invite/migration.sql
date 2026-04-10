-- CreateTable
CREATE TABLE "PlatformInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "revokedAt" DATETIME,
    "invitedByUserId" TEXT,
    "lastDeliveryAttemptedAt" DATETIME,
    "lastDeliveryState" TEXT,
    "lastDeliveryErrorCode" TEXT,
    CONSTRAINT "PlatformInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvite_tokenHash_key" ON "PlatformInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformInvite_email_idx" ON "PlatformInvite"("email");

-- CreateIndex
CREATE INDEX "PlatformInvite_acceptedAt_revokedAt_expiresAt_idx" ON "PlatformInvite"("acceptedAt", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "PlatformInvite_invitedByUserId_idx" ON "PlatformInvite"("invitedByUserId");

-- CreateIndex
CREATE INDEX "PlatformInvite_lastDeliveryState_lastDeliveryAttemptedAt_idx" ON "PlatformInvite"("lastDeliveryState", "lastDeliveryAttemptedAt");
