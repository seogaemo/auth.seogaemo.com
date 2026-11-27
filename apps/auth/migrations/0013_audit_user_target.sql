-- 사용자 대상 활동 기록(user.*)은 이메일 대신 사용자 ID로 남긴다.
-- 아직 있는 사용자는 ID로 바꾸고, 지워진 사용자의 이메일은 비운다.
UPDATE "AuditLog"
SET "target" = (
  SELECT u."id" FROM "User" u
  WHERE u."serviceId" = "AuditLog"."serviceId" AND u."email" = "AuditLog"."target"
  LIMIT 1
)
WHERE "action" LIKE 'user.%' AND "target" LIKE '%@%';
