-- AlterTable
ALTER TABLE "LoginTransaction" ADD COLUMN "verifiedMethod" TEXT;
ALTER TABLE "LoginTransaction" ADD COLUMN "verifiedUserId" TEXT;
ALTER TABLE "LoginTransaction" ADD COLUMN "webauthnChallenge" TEXT;

-- CreateTable
CREATE TABLE "PasskeyOwner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "aaguid" TEXT,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "Passkey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "PasskeyOwner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PasskeyOwner_email_key" ON "PasskeyOwner"("email");

-- CreateIndex
CREATE INDEX "Passkey_ownerId_idx" ON "Passkey"("ownerId");

