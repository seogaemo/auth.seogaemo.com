-- refresh token family: 한 번의 로그인(code 교환)에서 회전으로 이어진 토큰 묶음.
-- 재사용을 감지하면 그 사용자의 모든 토큰이 아니라 이 묶음만 끊는다 (다른 기기 로그인은 그대로).
ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT;
-- code를 두 번 쓰면 그 code로 시작한 묶음을 끊는다 (RFC 6749 4.1.2)
ALTER TABLE "AuthorizationCode" ADD COLUMN "familyId" TEXT;
-- 기존 토큰은 어떤 회전으로 이어졌는지 모르니 로그인 세션 단위로 묶는다. 세션이 없는 토큰은 자기 혼자다
UPDATE "RefreshToken" SET "familyId" = COALESCE("sessionId", "tokenHash") WHERE "familyId" IS NULL;
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
