/**
 * 쓸모없어진 행 청소. 하루 한 번 Cron(worker.ts의 scheduled)이 부른다.
 *
 * 요청 밖에서 돌기 때문에 getPrisma() 대신 D1 바인딩에 SQL을 바로 보낸다.
 * 날짜는 ISO 문자열로 저장돼 있어서 julianday()로 비교한다 (끝의 +00:00, Z 모두 읽는다).
 */

/** 만료된 뒤 하루는 남겨 둔다. 방금 만료된 행을 찾는 오류 메시지가 그대로 나오게 */
const EXPIRED_GRACE = "-1 day";

export const RETENTION = {
  /** 로그인 기록. 통계는 14일, 사용자 상세는 최근 기록만 쓴다 */
  loginEventDays: 90,
  /** 콘솔 활동 기록 */
  auditLogDays: 365,
} as const;

const RULES: { table: string; where: string }[] = [
  { table: "LoginTransaction", where: `julianday("expiresAt") < julianday('now', '${EXPIRED_GRACE}')` },
  { table: "AuthorizationCode", where: `julianday("expiresAt") < julianday('now', '${EXPIRED_GRACE}')` },
  { table: "EmailCode", where: `julianday("expiresAt") < julianday('now', '${EXPIRED_GRACE}')` },
  { table: "Session", where: `julianday("expiresAt") < julianday('now', '${EXPIRED_GRACE}')` },
  // 끊긴 토큰도 만료될 때까지는 남긴다. 재사용 감지가 이 행으로 같은 세션의 토큰을 함께 끊는다.
  { table: "RefreshToken", where: `julianday("expiresAt") < julianday('now', '${EXPIRED_GRACE}')` },
  // 패스키는 이메일에 붙는다. 어느 서비스에도 그 이메일의 사용자가 없으면 소유자와 패스키(cascade)를 지운다.
  // 탈퇴해도 패스키는 지우지 않으니(다른 서비스에서 계속 쓰므로) 마지막 사용자가 사라진 뒤에야 치워진다.
  {
    table: "PasskeyOwner",
    where: `"email" NOT IN (SELECT "email" FROM "User" WHERE "email" IS NOT NULL)`,
  },
  // 저장 도중에 그만둬서 패스키 없이 남은 소유자
  {
    table: "PasskeyOwner",
    where: `julianday("createdAt") < julianday('now', '${EXPIRED_GRACE}') AND NOT EXISTS (SELECT 1 FROM "Passkey" WHERE "Passkey"."ownerId" = "PasskeyOwner"."id")`,
  },
  { table: "LoginEvent", where: `julianday("createdAt") < julianday('now', '-${RETENTION.loginEventDays} days')` },
  { table: "AuditLog", where: `julianday("createdAt") < julianday('now', '-${RETENTION.auditLogDays} days')` },
];

export async function cleanupExpired(db: D1Database) {
  const results = await db.batch(RULES.map(({ table, where }) => db.prepare(`DELETE FROM "${table}" WHERE ${where}`)));
  // 한 테이블에 규칙이 둘 이상일 수 있어서 합친다
  const counts: Record<string, number> = {};
  RULES.forEach(({ table }, i) => {
    counts[table] = (counts[table] ?? 0) + (results[i].meta.changes ?? 0);
  });
  return counts;
}
