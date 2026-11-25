/**
 * OIDC Back-Channel Logout 1.0: 로그인 세션이 끝나거나 계정이 지워지면 앱이 등록한 주소로 logout token을 POST한다.
 *
 * - sid 있음: 그 로그인 세션 하나가 끝났다 (로그아웃, 다른 기기 로그아웃, 같은 브라우저에서 다른 계정 로그인)
 * - sid 없음: 그 sub의 모든 세션이 끝났다 (관리자가 세션 끊기, 정지)
 * - purged: 계정이 지워졌다. 로그아웃 이벤트에 RISC account-purged를 같이 싣는다 (앱은 사용자 데이터를 지운다)
 *
 * 알림은 DB(BackchannelDelivery)에 먼저 적고 바로 한 번 보낸다. 실패하면 Cron(worker.ts)이 간격을 늘려 가며 다시 보낸다.
 * 재전송은 같은 jti로 새로 서명한다 (exp가 2분이라 옛 서명은 못 쓴다). 앱은 jti로 중복을 거른다.
 *
 * 요청 밖(Cron)에서도 돌아서 Prisma 대신 D1에 SQL을 바로 보낸다. 날짜는 Prisma가 쓰는 형식(+00:00)으로 적는다.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { signLogoutToken, type IdTokenAlg } from "./token";

export const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";
export const PURGED_EVENT = "https://schemas.openid.net/secevent/risc/event-type/account-purged";

/** n번째 실패 뒤 기다릴 시간(분). 목록을 넘어가면 마지막 값을 계속 쓴다 */
const RETRY_AFTER_MIN = [1, 5, 30, 120, 360, 720];
/** 이 시간 동안 실패가 이어지면 포기한다. 계정 삭제는 놓치면 앱에 데이터가 남으니 길게 */
const GIVE_UP_MS = { logout: 24 * 60 * 60 * 1000, purged: 7 * 24 * 60 * 60 * 1000 };
const TIMEOUT_MS = 5000;
/** Cron 한 번에 보낼 최대 개수 (Worker 실행 시간 안에 끝나게) */
const BATCH = 50;

export interface BackchannelEvent {
  sub: string;
  sid?: string | null;
  purged?: boolean;
}

interface DeliveryRow {
  id: string;
  serviceId: string;
  url: string;
  sub: string;
  sid: string | null;
  purged: number;
  attempts: number;
  giveUpAt: string;
  clientId: string;
  idTokenSigningAlg: string;
}

const iso = (date: Date) => date.toISOString().replace("Z", "+00:00");

/**
 * 요청 처리 중에 부른다. 앱이 주소를 등록하지 않았으면 아무것도 안 한다.
 * 알림을 기다리지 않는다 (waitUntil). 보내지 못해도 원래 작업(로그아웃, 탈퇴)은 끝난다.
 */
export async function notifyBackchannel(serviceId: string, events: BackchannelEvent[]) {
  if (events.length === 0) return;
  try {
    const { env, ctx } = getCloudflareContext();
    const service = await env.DB.prepare(`SELECT "backchannelLogoutUri" AS url FROM "Service" WHERE "id" = ?`)
      .bind(serviceId)
      .first<{ url: string | null }>();
    if (!service?.url) return;

    const now = Date.now();
    // 바로 한 번 보낸다. 그 시도가 결과를 적기 전에 Worker가 끝나도 Cron이 1분 뒤부터 이어받는다
    const firstRetry = iso(new Date(now + 60 * 1000));
    const ids: string[] = [];
    const inserts = events.map((event) => {
      const id = crypto.randomUUID();
      ids.push(id);
      const giveUp = now + (event.purged ? GIVE_UP_MS.purged : GIVE_UP_MS.logout);
      return env.DB.prepare(
        `INSERT INTO "BackchannelDelivery" ("id", "serviceId", "url", "sub", "sid", "purged", "nextAttemptAt", "giveUpAt", "createdAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, serviceId, service.url, event.sub, event.sid ?? null, event.purged ? 1 : 0, firstRetry, iso(new Date(giveUp)), iso(new Date(now)));
    });
    await env.DB.batch(inserts);
    ctx.waitUntil(deliverByIds(env, ids).catch((error) => console.error("backchannel delivery failed", error)));
  } catch (error) {
    console.error("backchannel enqueue failed", error);
  }
}

/** Cron: 보낼 때가 된 알림을 보낸다 */
export async function deliverDue(env: CloudflareEnv) {
  const { results } = await env.DB.prepare(
    `${SELECT_ROWS} WHERE d."nextAttemptAt" IS NOT NULL AND julianday(d."nextAttemptAt") <= julianday('now') ORDER BY d."nextAttemptAt" LIMIT ${BATCH}`,
  ).all<DeliveryRow>();
  for (const row of results) await deliver(env, row);
  return results.length;
}

/** 콘솔의 "다시 보내기": 포기한 알림을 처음부터 다시 시도한다 */
export async function retryDelivery(serviceId: string, id: string) {
  const { env, ctx } = getCloudflareContext();
  const row = await env.DB.prepare(`SELECT "purged" FROM "BackchannelDelivery" WHERE "id" = ? AND "serviceId" = ? AND "deliveredAt" IS NULL`)
    .bind(id, serviceId)
    .first<{ purged: number }>();
  if (!row) return false;
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE "BackchannelDelivery" SET "attempts" = 0, "failedAt" = NULL, "nextAttemptAt" = ?, "giveUpAt" = ? WHERE "id" = ?`,
  )
    .bind(iso(new Date(now + 60 * 1000)), iso(new Date(now + (row.purged ? GIVE_UP_MS.purged : GIVE_UP_MS.logout))), id)
    .run();
  ctx.waitUntil(deliverByIds(env, [id]).catch((error) => console.error("backchannel retry failed", error)));
  return true;
}

const SELECT_ROWS = `SELECT d."id", d."serviceId", d."url", d."sub", d."sid", d."purged", d."attempts", d."giveUpAt",
  s."clientId", s."idTokenSigningAlg"
  FROM "BackchannelDelivery" d JOIN "Service" s ON s."id" = d."serviceId"`;

async function deliverByIds(env: CloudflareEnv, ids: string[]) {
  if (ids.length === 0) return;
  const { results } = await env.DB.prepare(`${SELECT_ROWS} WHERE d."id" IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<DeliveryRow>();
  await Promise.all(results.map((row) => deliver(env, row)));
}

async function deliver(env: CloudflareEnv, row: DeliveryRow) {
  let result: string;
  let ok = false;
  try {
    const token = await signLogoutToken(
      env,
      {
        aud: row.clientId,
        sub: row.sub,
        ...(row.sid ? { sid: row.sid } : {}),
        jti: row.id,
        events: { [LOGOUT_EVENT]: {}, ...(row.purged ? { [PURGED_EVENT]: {} } : {}) },
      },
      (row.idTokenSigningAlg === "RS256" ? "RS256" : "ES256") as IdTokenAlg,
    );
    const response = await fetch(row.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ logout_token: token }),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 본문은 읽지 않지만 연결을 놓아 준다
    await response.body?.cancel();
    ok = response.status >= 200 && response.status < 300;
    result = `HTTP ${response.status}`;
  } catch (error) {
    result = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "error";
  }

  const now = new Date();
  const attempts = row.attempts + 1;
  if (ok) {
    await env.DB.prepare(
      `UPDATE "BackchannelDelivery" SET "attempts" = ?, "lastResult" = ?, "deliveredAt" = ?, "nextAttemptAt" = NULL WHERE "id" = ?`,
    )
      .bind(attempts, result, iso(now), row.id)
      .run();
    return;
  }
  const wait = RETRY_AFTER_MIN[Math.min(attempts - 1, RETRY_AFTER_MIN.length - 1)]! * 60 * 1000;
  const next = new Date(now.getTime() + wait);
  const giveUp = next.getTime() > Date.parse(row.giveUpAt);
  await env.DB.prepare(
    `UPDATE "BackchannelDelivery" SET "attempts" = ?, "lastResult" = ?, "nextAttemptAt" = ?, "failedAt" = ? WHERE "id" = ?`,
  )
    .bind(attempts, result, giveUp ? null : iso(next), giveUp ? iso(now) : null, row.id)
    .run();
}
