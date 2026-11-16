-- 초기 실험 때 만든 옛 User 테이블이 원격 D1에 남아 있을 수 있어 지우고 시작한다.
DROP TABLE IF EXISTS "User";

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoKey" TEXT,
    "redirectUris" JSONB NOT NULL DEFAULT [],
    "providers" JSONB NOT NULL DEFAULT [],
    "brandColor" TEXT,
    "brandBackground" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "name" TEXT,
    "image" TEXT,
    "serviceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME,
    CONSTRAINT "User_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Identity_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "state" TEXT,
    "scope" TEXT NOT NULL,
    "nonce" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL,
    "provider" TEXT,
    "providerState" TEXT,
    "providerCodeVerifier" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginTransaction_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthorizationCode" (
    "codeHash" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "nonce" TEXT,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthorizationCode_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_clientId_key" ON "Service"("clientId");

-- CreateIndex
CREATE INDEX "Service_ownerId_idx" ON "Service"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_serviceId_email_key" ON "User"("serviceId", "email");

-- CreateIndex
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_serviceId_provider_providerUserId_key" ON "Identity"("serviceId", "provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "LoginTransaction_providerState_key" ON "LoginTransaction"("providerState");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

