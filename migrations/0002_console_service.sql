-- Seogaemo 콘솔을 시스템 서비스로 등록한다. 개발자는 이 서비스의 사용자로 콘솔에 로그인한다.
-- public client (PKCE만), redirect_uri는 코드에서 {ISSUER}/console/callback으로 고정한다.
INSERT OR IGNORE INTO "Service" (
  "id", "clientId", "clientSecretHash", "name", "redirectUris", "providers",
  "isSystem", "createdAt", "updatedAt"
) VALUES (
  'svc_console', 'seogaemo-console', '', 'Seogaemo', '[]', '["google","kakao"]',
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
