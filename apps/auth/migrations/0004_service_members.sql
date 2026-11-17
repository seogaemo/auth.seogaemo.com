-- 서비스 관리자. 소유자(Service.ownerId) 말고 같이 관리하는 개발자를 콘솔 계정 이메일로 둔다.
-- CreateTable
CREATE TABLE "ServiceMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceMember_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ServiceMember_email_idx" ON "ServiceMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceMember_serviceId_email_key" ON "ServiceMember"("serviceId", "email");

