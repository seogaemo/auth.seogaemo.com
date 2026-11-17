-- AlterTable
ALTER TABLE "AuthorizationCode" ADD COLUMN "authTime" DATETIME;
ALTER TABLE "AuthorizationCode" ADD COLUMN "sessionId" TEXT;

-- AlterTable
ALTER TABLE "LoginTransaction" ADD COLUMN "loginHint" TEXT;
ALTER TABLE "LoginTransaction" ADD COLUMN "maxAge" INTEGER;
ALTER TABLE "LoginTransaction" ADD COLUMN "prompt" TEXT;
ALTER TABLE "LoginTransaction" ADD COLUMN "returnTo" TEXT;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "sessionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "browserHash" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authTime" DATETIME NOT NULL,
    "method" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "type" TEXT NOT NULL,
    "method" TEXT,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginEvent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
-- Prisma는 Service를 새로 만들어 옮기는 SQL을 내지만, D1에서 부모 테이블을 DROP하면
-- ON DELETE CASCADE로 사용자와 토큰이 같이 지워질 수 있어 컬럼만 추가한다.
ALTER TABLE "Service" ADD COLUMN "signupEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Service" ADD COLUMN "termsUrl" TEXT;
ALTER TABLE "Service" ADD COLUMN "privacyUrl" TEXT;

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_browserHash_serviceId_key" ON "Session"("browserHash", "serviceId");

-- CreateIndex
CREATE INDEX "LoginEvent_serviceId_createdAt_idx" ON "LoginEvent"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_serviceId_createdAt_idx" ON "AuditLog"("serviceId", "createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_idx" ON "RefreshToken"("sessionId");

