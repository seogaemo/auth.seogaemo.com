-- 이메일/비밀번호 로그인, 이메일 코드 로그인

-- AlterTable
ALTER TABLE "Identity" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "Identity" ADD COLUMN "failedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Identity" ADD COLUMN "lockedUntil" DATETIME;

-- CreateTable
CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "pendingPasswordHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailCode_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EmailCode_serviceId_email_createdAt_idx" ON "EmailCode"("serviceId", "email", "createdAt");

-- 콘솔(시스템 서비스)에도 이메일/비밀번호, 이메일 코드 로그인을 켠다
UPDATE "Service" SET "providers" = '["password","email","google","kakao"]' WHERE "id" = 'svc_console';
