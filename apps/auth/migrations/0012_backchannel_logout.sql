-- OIDC Back-Channel Logout: 앱이 등록한 주소로 로그아웃, 계정 삭제를 알린다
ALTER TABLE "Service" ADD COLUMN "backchannelLogoutUri" TEXT;

-- 보낼 알림과 전달 상태. 실패하면 nextAttemptAt에 다시 보낸다 (Cron)
CREATE TABLE "BackchannelDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "sid" TEXT,
    "purged" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastResult" TEXT,
    "nextAttemptAt" DATETIME,
    "giveUpAt" DATETIME NOT NULL,
    "deliveredAt" DATETIME,
    "failedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackchannelDelivery_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BackchannelDelivery_nextAttemptAt_idx" ON "BackchannelDelivery"("nextAttemptAt");
CREATE INDEX "BackchannelDelivery_serviceId_createdAt_idx" ON "BackchannelDelivery"("serviceId", "createdAt");
