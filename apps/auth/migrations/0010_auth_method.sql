-- 토큰의 amr 클레임: code와 refresh token에 직접 인증한 수단을 남긴다 (갱신해도 이어진다)
ALTER TABLE "AuthorizationCode" ADD COLUMN "authMethod" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "authMethod" TEXT;
