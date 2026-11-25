// OIDC Back-Channel Logout을 로컬 서버로 확인한다. 알림을 받는 작은 서버를 띄우고, 세션이 끝나는 경우마다
// logout token이 오는지, 서명과 클레임이 맞는지, 실패하면 Cron이 같은 jti로 다시 보내는지 본다.
//
// 사용 (Cron을 부르려고 --test-scheduled를 붙인다. ISSUER는 .dev.vars의 http://localhost:8787):
//   npx opennextjs-cloudflare build
//   npx wrangler dev --port 8787 --test-scheduled --var GOOGLE_CLIENT_ID:test --var GOOGLE_CLIENT_SECRET:test
//   node scripts/e2e-backchannel-local.mjs
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import http from "node:http";

import { createRemoteJWKSet, jwtVerify } from "jose";
import { chromium } from "playwright-core";

const B = process.env.E2E_BASE ?? "http://localhost:8787";
const R = "http://localhost:5173/callback";
const RECEIVER_PORT = 5199;
const LOGOUT = "http://schemas.openid.net/event/backchannel-logout";
const PURGED = "https://schemas.openid.net/secevent/risc/event-type/account-purged";
const DEV = { client_id: "dev-client", client_secret: "dev-secret" };

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`); };
const b64u = (b) => Buffer.from(b).toString("base64url");
const hex = (v) => createHash("sha256").update(v).digest("hex");
const d1 = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--json", "--command", s], { stdio: "pipe" }).toString();
const rows = (s) => JSON.parse(d1(s))[0].results;
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 알림 받는 서버. statuses에 넣은 순서대로 응답 코드를 돌려주고, 비면 200
const received = [];
const statuses = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ contentType: req.headers["content-type"], token: new URLSearchParams(body).get("logout_token") });
    res.statusCode = statuses.shift() ?? 200;
    res.end();
  });
});
await new Promise((r) => server.listen(RECEIVER_PORT, r));

async function waitFor(count, ms = 10000) {
  const until = Date.now() + ms;
  while (received.length < count && Date.now() < until) await sleep(100);
  return received.length >= count;
}

const JWKS = createRemoteJWKSet(new URL(`${B}/.well-known/jwks.json`));
async function verify(token) {
  const { payload, protectedHeader } = await jwtVerify(token, JWKS, { issuer: B, audience: "dev-client", typ: "logout+jwt" });
  return { payload, header: protectedHeader };
}

// --- 준비: 사용자 둘, 알림 주소
const verifier = b64u(randomBytes(32));
const challenge = b64u(createHash("sha256").update(verifier).digest());
const EMAILS = ["bc1@example.com", "bc2@example.com"];
d1(`DELETE FROM "User" WHERE email IN ('${EMAILS.join("','")}') AND serviceId = 'svc_dev';
DELETE FROM "BackchannelDelivery" WHERE serviceId = 'svc_dev';
UPDATE "Service" SET backchannelLogoutUri = 'http://localhost:${RECEIVER_PORT}/bc', providers = '["password","email","google","kakao"]', signupEnabled = 1, restrictLogin = 0 WHERE id = 'svc_dev';
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_bc1','${EMAILS[0]}','BC1','svc_dev','${now()}');
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_bc2','${EMAILS[1]}','BC2','svc_dev','${now()}');`);

/** 이 브라우저 키로 usr의 세션을 만든다 */
function session(id, userId) {
  const key = b64u(randomBytes(32));
  d1(`INSERT INTO "Session" (id, browserHash, serviceId, userId, authTime, method, lastSeenAt, expiresAt, createdAt)
VALUES ('${id}','${hex(key)}','svc_dev','${userId}','${now()}','email','${now()}','${new Date(Date.now() + 86400000).toISOString()}','${now()}');`);
  return key;
}

/** 세션으로 로그인 화면 없이 code를 받아 토큰으로 바꾼다 (실제 경로라 refresh token에 sessionId가 붙는다) */
async function tokensFor(key) {
  const q = new URLSearchParams({ client_id: "dev-client", redirect_uri: R, response_type: "code", scope: "openid email", state: "s", nonce: "n", code_challenge: challenge, code_challenge_method: "S256" });
  const r = await fetch(`${B}/oauth/authorize?${q}`, { redirect: "manual", headers: { cookie: `sg_browser=${key}` } });
  const code = new URL(r.headers.get("location")).searchParams.get("code");
  const t = await fetch(`${B}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: R, code_verifier: verifier, ...DEV }) });
  return t.json();
}
const decode = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
const delivery = (jti) => rows(`SELECT * FROM "BackchannelDelivery" WHERE id = '${jti}'`)[0];

try {
  console.log("--- discovery");
  const disc = await (await fetch(`${B}/.well-known/openid-configuration`)).json();
  check("backchannel_logout_supported and _session_supported", disc.backchannel_logout_supported === true && disc.backchannel_logout_session_supported === true);

  console.log("--- RP-initiated logout -> logout token with sid");
  {
    const key = session("ses_bc1", "usr_bc1");
    const t = await tokensFor(key);
    check("access token carries sid", decode(t.access_token).sid === "ses_bc1", JSON.stringify(decode(t.access_token)));
    await fetch(`${B}/oauth/logout?id_token_hint=${t.id_token}`, { redirect: "manual", headers: { cookie: `sg_browser=${key}` } });
    check("notification received", await waitFor(1));
    const { token, contentType } = received[0];
    check("POST is form-encoded with logout_token", contentType?.startsWith("application/x-www-form-urlencoded") && typeof token === "string");
    const { payload, header } = await verify(token);
    check("signature, iss, aud, typ=logout+jwt verify against JWKS", true);
    check("alg follows the app's ID token setting (RS256 for dev-client)", header.alg === "RS256", header.alg);
    check("sub and sid of the ended session", payload.sub === "usr_bc1" && payload.sid === "ses_bc1", JSON.stringify(payload));
    check("events = backchannel-logout only", JSON.stringify(Object.keys(payload.events)) === JSON.stringify([LOGOUT]), JSON.stringify(payload.events));
    check("no nonce, exp = iat + 120, jti present", payload.nonce === undefined && payload.exp - payload.iat === 120 && typeof payload.jti === "string");
    await sleep(300);
    check("delivery recorded as delivered", delivery(payload.jti)?.deliveredAt != null, JSON.stringify(delivery(payload.jti)));
  }

  console.log("--- failure, then the Cron retry with the same jti");
  {
    const key = session("ses_bc2", "usr_bc1");
    const t = await tokensFor(key);
    statuses.push(503);
    const before = received.length;
    await fetch(`${B}/oauth/logout?id_token_hint=${t.id_token}`, { redirect: "manual", headers: { cookie: `sg_browser=${key}` } });
    await waitFor(before + 1);
    await sleep(500);
    const first = (await verify(received[before].token)).payload;
    const row = delivery(first.jti);
    check("failed attempt is recorded with a next attempt", row?.attempts === 1 && row.lastResult === "HTTP 503" && row.nextAttemptAt && !row.deliveredAt, JSON.stringify(row));
    d1(`UPDATE "BackchannelDelivery" SET nextAttemptAt = '${new Date(Date.now() - 1000).toISOString().replace("Z", "+00:00")}' WHERE id = '${first.jti}';`);
    await fetch(`${B}/__scheduled?cron=${encodeURIComponent("* * * * *")}`);
    check("Cron sends it again", await waitFor(before + 2));
    const second = (await verify(received[before + 1].token)).payload;
    check("retry keeps the jti and re-signs (fresh iat)", second.jti === first.jti && second.iat >= first.iat);
    await sleep(500);
    const after = delivery(first.jti);
    check("retry recorded as delivered", after?.deliveredAt != null && after.attempts === 2 && after.nextAttemptAt == null, JSON.stringify(after));
  }

  const browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }) });
  const withCookie = async (key) => {
    const context = await browser.newContext();
    await context.addCookies([{ name: "sg_browser", value: key, url: B }]);
    await context.route(`${new URL(R).origin}/**`, (route) => route.fulfill({ status: 200, body: "callback" }));
    return context.newPage();
  };

  console.log("--- account: sign out other devices -> one notification per ended session");
  {
    const here = session("ses_bc3", "usr_bc1");
    session("ses_bc4", "usr_bc1");
    // 세션 행은 청소됐지만 그 세션의 refresh token은 살아 있는 경우도 알린다
    const k5 = session("ses_bc5", "usr_bc1");
    await tokensFor(k5);
    d1(`DELETE FROM "Session" WHERE id = 'ses_bc5';`);
    const before = received.length;
    const page = await withCookie(here);
    await page.goto(`${B}/account?client_id=dev-client`);
    await page.getByRole("button", { name: "다른 기기 모두 로그아웃" }).click();
    await waitFor(before + 2);
    await sleep(500);
    const sids = (await Promise.all(received.slice(before).map((r) => verify(r.token)))).map((v) => v.payload.sid).sort();
    check("ended sessions are notified, the current one is not", JSON.stringify(sids) === JSON.stringify(["ses_bc4", "ses_bc5"]), JSON.stringify(sids));
    await page.context().close();
  }

  console.log("--- same browser, another account -> previous account's session ends with a new sid");
  {
    const key = session("ses_bc6", "usr_bc1");
    const before = received.length;
    const page = await withCookie(key);
    await page.goto(`${B}/oauth/authorize?${new URLSearchParams({ client_id: "dev-client", redirect_uri: R, response_type: "code", scope: "openid email", state: "s", code_challenge: challenge, code_challenge_method: "S256", prompt: "login" })}`);
    await page.fill("#email", EMAILS[1]);
    await page.click("button[type=submit]");
    await page.waitForURL("**/login/verify");
    d1(`UPDATE "EmailCode" SET codeHash = '${hex("123456")}' WHERE email = '${EMAILS[1]}' AND consumedAt IS NULL;`);
    await page.fill("#code", "123456");
    await page.click("button[type=submit]");
    await page.waitForURL((u) => u.pathname.startsWith("/login/passkey") || u.href.startsWith(R), { timeout: 15000 });
    if (new URL(page.url()).pathname.startsWith("/login/passkey")) {
      await page.getByRole("button", { name: "건너뛰기" }).click();
      await page.waitForURL((u) => u.href.startsWith(R), { timeout: 15000 });
    }
    check("previous account notified", await waitFor(before + 1));
    const { payload } = await verify(received[before].token);
    check("...with its sub and old sid", payload.sub === "usr_bc1" && payload.sid === "ses_bc6", JSON.stringify(payload));
    const fresh = rows(`SELECT id, userId FROM "Session" WHERE browserHash = '${hex(key)}' AND serviceId = 'svc_dev'`)[0];
    check("new account gets a new session id", fresh?.userId === "usr_bc2" && fresh.id !== "ses_bc6", JSON.stringify(fresh));

    console.log("--- account deletion -> account-purged, login records scrubbed");
    const deleteBefore = received.length;
    await page.goto(`${B}/account?client_id=dev-client`);
    await page.fill("#confirm", EMAILS[1]);
    await page.getByRole("button", { name: "탈퇴하기" }).click();
    check("deletion notified", await waitFor(deleteBefore + 1));
    const purged = (await verify(received[deleteBefore].token)).payload;
    check("sub, no sid, events = logout + account-purged", purged.sub === "usr_bc2" && purged.sid === undefined && purged.events[LOGOUT] && purged.events[PURGED], JSON.stringify(purged));
    const gone = delivery(purged.jti);
    check("account-purged retries for 7 days", Date.parse(gone.giveUpAt) - Date.parse(gone.createdAt) >= 6.9 * 86400000, JSON.stringify(gone));
    check("login records keep no email, IP or User-Agent", rows(`SELECT count(*) c FROM "LoginEvent" WHERE serviceId = 'svc_dev' AND (email = '${EMAILS[1]}' OR userId = 'usr_bc2') AND (email IS NOT NULL OR ip IS NOT NULL OR userAgent IS NOT NULL)`)[0].c === 0);
    check("...but the rows stay for stats", rows(`SELECT count(*) c FROM "LoginEvent" WHERE serviceId = 'svc_dev' AND userId = 'usr_bc2'`)[0].c >= 1);
    await page.context().close();
  }
  await browser.close();

  console.log("--- no address registered -> nothing is sent");
  {
    d1(`UPDATE "Service" SET backchannelLogoutUri = NULL WHERE id = 'svc_dev';`);
    const key = session("ses_bc7", "usr_bc1");
    const t = await tokensFor(key);
    const before = received.length;
    await fetch(`${B}/oauth/logout?id_token_hint=${t.id_token}`, { redirect: "manual", headers: { cookie: `sg_browser=${key}` } });
    await sleep(1500);
    check("no notification", received.length === before && rows(`SELECT count(*) c FROM "BackchannelDelivery" WHERE sid = 'ses_bc7'`)[0].c === 0);
  }
} finally {
  d1(`UPDATE "Service" SET backchannelLogoutUri = NULL WHERE id = 'svc_dev';
DELETE FROM "User" WHERE id IN ('usr_bc1','usr_bc2');
DELETE FROM "Session" WHERE id LIKE 'ses_bc%';`);
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
