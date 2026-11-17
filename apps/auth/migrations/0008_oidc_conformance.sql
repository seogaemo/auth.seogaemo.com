-- 표준 맞추기 (OIDC Discovery, RP-Initiated Logout, Core 12.2)

-- ID 토큰 서명 알고리즘. 기존 앱은 지금처럼 ES256, 새 앱은 콘솔이 RS256으로 만든다.
ALTER TABLE "Service" ADD COLUMN "idTokenSigningAlg" TEXT NOT NULL DEFAULT 'ES256';

-- 로그아웃 뒤 돌아갈 주소. 지금까지는 웹 Redirect URI와 origin만 같으면 보냈으므로,
-- 기존 앱에는 웹 Redirect URI들의 origin(https://app.example.com)을 미리 넣어 그대로 동작하게 한다.
ALTER TABLE "Service" ADD COLUMN "postLogoutRedirectUris" JSONB NOT NULL DEFAULT '[]';

UPDATE "Service"
SET "postLogoutRedirectUris" = COALESCE((
  SELECT json_group_array("origin") FROM (
    SELECT DISTINCT
      substr("uri", 1, instr("uri", '://') + 2) ||
      CASE
        WHEN instr("rest", '/') > 0 THEN substr("rest", 1, instr("rest", '/') - 1)
        WHEN instr("rest", '?') > 0 THEN substr("rest", 1, instr("rest", '?') - 1)
        ELSE "rest"
      END AS "origin"
    FROM (
      SELECT "value" AS "uri", substr("value", instr("value", '://') + 3) AS "rest"
      FROM json_each("Service"."redirectUris")
      WHERE "value" LIKE 'https://%' OR "value" LIKE 'http://%'
    )
  )
), '[]')
WHERE "isSystem" = false;

-- 갱신 때 새 ID 토큰의 auth_time을 처음 인증 시각으로 유지한다
ALTER TABLE "RefreshToken" ADD COLUMN "authTime" DATETIME;
