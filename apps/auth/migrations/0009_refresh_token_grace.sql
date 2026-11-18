-- refresh token 회전 유예 시간 (Okta grace period, Auth0 reuse interval)
ALTER TABLE "Service" ADD COLUMN "refreshTokenGraceSec" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "RefreshToken" ADD COLUMN "rotatedAt" DATETIME;
