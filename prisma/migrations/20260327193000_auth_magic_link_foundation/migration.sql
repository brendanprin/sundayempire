-- CreateTable
CREATE TABLE "AuthMagicLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'SIGN_IN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "requestedByIp" TEXT,
    "requestedByUserAgent" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthMagicLink_tokenHash_key" ON "AuthMagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthMagicLink_email_expiresAt_idx" ON "AuthMagicLink"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthMagicLink_consumedAt_expiresAt_idx" ON "AuthMagicLink"("consumedAt", "expiresAt");
