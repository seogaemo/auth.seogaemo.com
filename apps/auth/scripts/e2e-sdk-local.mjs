// @seogaemo/oauth(packages/oauth)를 로컬 서버에 그대로 붙여 보는 스크립트.
// SDK가 만든 authorize 주소를 서버가 받는지, 서버가 준 토큰을 SDK가 검증하는지 양쪽을 같이 확인한다.
// 외부 제공자 로그인은 못 하므로 e2e-local.mjs처럼 authorization code를 DB에 직접 넣고,
// 서버가 콜백에 붙이는 것과 같은 주소(code, state, iss)를 만들어 finishLogin에 넘긴다.
//
// 사용 (e2e-local.mjs와 같은 준비 뒤):
//   pnpm --filter @seogaemo/oauth build
//   node scripts/e2e-sdk-local.mjs
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

import { createClient, OAuthError, ValidationError } from "@seogaemo/oauth";

const B = process.env.E2E_BASE ?? "http://localhost:8787";
const REDIRECT = "http://localhost:5173/callback";
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`); };
const sql = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--command", s], { stdio: "pipe" });
const hex = (v) => createHash("sha256").update(v).digest("hex");
const rejects = async (promise, test) => { try { await promise; return false; } catch (e) { return test(e); } };

sql(`DELETE FROM "User" WHERE id = 'usr_sdk';
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_sdk','sdk@example.com','SDK','svc_dev','${new Date().toISOString()}');
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_sdk_pub','sdk@example.com','SDK','svc_dev_public','${new Date().toISOString()}')
  ON CONFLICT DO NOTHING;`);

/** 서버의 로그인 화면과 제공자 단계를 건너뛰고, 그 끝에 서버가 만드는 code와 콜백 주소를 만든다 */
function serverIssuesCode(authorizeUrl, serviceId, userId) {
  const p = authorizeUrl.searchParams;
  const code = randomBytes(32).toString("base64url");
  const now = new Date();
  const nonce = p.get("nonce") ? `'${p.get("nonce")}'` : "NULL";
  sql(`INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, nonce, codeChallenge, codeChallengeMethod, expiresAt, createdAt, authTime)
VALUES ('${hex(code)}','${serviceId}','${userId}','${p.get("redirect_uri")}','${p.get("scope")}',${nonce},'${p.get("code_challenge")}','S256','${new Date(now.getTime() + 300000).toISOString()}','${now.toISOString()}','${now.toISOString()}');`);
  const callback = new URL(p.get("redirect_uri"));
  callback.search = new URLSearchParams({ code, state: p.get("state"), iss: B }).toString();
  return callback;
}

for (const [label, options, serviceId, userId] of [
  ["confidential, client_secret_basic", { clientId: "dev-client", clientSecret: "dev-secret" }, "svc_dev", "usr_sdk"],
  ["confidential, client_secret_post", { clientId: "dev-client", clientSecret: "dev-secret", authMethod: "client_secret_post" }, "svc_dev", "usr_sdk"],
  ["public client (PKCE only)", { clientId: "dev-public" }, "svc_dev_public", "usr_sdk_pub"],
]) {
  console.log(`--- ${label}`);
  const client = await createClient({ issuer: B, redirectUri: REDIRECT, ...options });
  check("discovery", client.metadata.issuer === B);

  const { url, transaction } = await client.startLogin({ prompt: "login" });
  const r = await fetch(url, { redirect: "manual" });
  check("server accepts the SDK's authorize URL", r.status === 302 && new URL(r.headers.get("location"), B).pathname === "/login", `${r.status} ${r.headers.get("location")}`);

  const result = await client.finishLogin(serverIssuesCode(url, serviceId, userId), transaction);
  check("code exchange + ID token verified (sig, iss, aud, nonce)", result.claims?.sub === userId && result.claims?.nonce === transaction.nonce, JSON.stringify(result.claims));
  check("refresh token issued", typeof result.tokens.refresh_token === "string");

  const info = await client.userInfo(result.tokens.access_token, result.claims.sub);
  check("userinfo sub matches", info.sub === userId && info.email === "sdk@example.com");

  const refreshed = await client.refresh(result.tokens.refresh_token);
  check("refresh rotates the token", refreshed.tokens.refresh_token && refreshed.tokens.refresh_token !== result.tokens.refresh_token);
  check("refreshed ID token verified", refreshed.claims?.sub === userId);
  check(
    "reusing the old refresh token -> invalid_grant",
    await rejects(client.refresh(result.tokens.refresh_token), (e) => e instanceof OAuthError && e.error === "invalid_grant"),
  );

  await client.revoke(refreshed.tokens.refresh_token, "refresh_token");
  check(
    "revoked refresh token no longer works",
    await rejects(client.refresh(refreshed.tokens.refresh_token), (e) => e instanceof OAuthError && e.error === "invalid_grant"),
  );

  const replay = await client.startLogin();
  const callback = serverIssuesCode(replay.url, serviceId, userId);
  await client.finishLogin(callback, replay.transaction);
  check(
    "a used code cannot be exchanged again",
    await rejects(client.finishLogin(callback, replay.transaction), (e) => e instanceof OAuthError && e.error === "invalid_grant"),
  );

  const forged = new URL(callback);
  forged.searchParams.set("iss", "https://evil.example.com");
  check("callback with another iss is refused", await rejects(client.finishLogin(forged, replay.transaction), (e) => e instanceof ValidationError && e.code === "issuer_mismatch"));

  const logout = client.logoutUrl({ idTokenHint: result.tokens.id_token, postLogoutRedirectUri: "http://localhost:5173/" });
  const lr = await fetch(logout, { redirect: "manual" });
  check("server accepts the SDK's logout URL", lr.status >= 300 && lr.status < 400, `${lr.status}`);
}

const wrong = await createClient({ issuer: B, redirectUri: REDIRECT, clientId: "dev-client", clientSecret: "wrong" });
const { url, transaction } = await wrong.startLogin();
check(
  "wrong secret -> invalid_client 401",
  await rejects(wrong.finishLogin(serverIssuesCode(url, "svc_dev", "usr_sdk"), transaction), (e) => e instanceof OAuthError && e.error === "invalid_client" && e.status === 401),
);

// --- 네이티브 앱: private-use URI scheme (RFC 8252 7.1)
console.log("--- native app (com.seogaemo.dev:/oauth/callback)");
const APP = "com.seogaemo.dev:/oauth/callback";
const savedUris = JSON.parse(
  JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--json", "--command", `SELECT redirectUris FROM "Service" WHERE id='svc_dev_public'`], { stdio: "pipe" }).toString())[0].results[0].redirectUris,
);
sql(`UPDATE "Service" SET redirectUris='${JSON.stringify([...savedUris, APP])}' WHERE id='svc_dev_public';`);
try {
  const app = await createClient({ issuer: B, redirectUri: APP, clientId: "dev-public" });
  const { url, transaction } = await app.startLogin();
  let r = await fetch(url, { redirect: "manual" });
  check("authorize accepts an app scheme redirect_uri", r.status === 302 && new URL(r.headers.get("location"), B).pathname === "/login", `${r.status} ${r.headers.get("location")}`);

  const result = await app.finishLogin(serverIssuesCode(url, "svc_dev_public", "usr_sdk_pub"), transaction);
  check("code for the app scheme exchanges and verifies", result.claims?.sub === "usr_sdk_pub");

  // 서버가 직접 앱 스킴으로 돌려보내는 응답: 오류(PKCE 없음)와 prompt=none
  const noPkce = new URL(url);
  noPkce.searchParams.delete("code_challenge");
  r = await fetch(noPkce, { redirect: "manual" });
  const errorBack = r.headers.get("location") ?? "";
  check("errors go back to the app scheme with state and iss", errorBack.startsWith(`${APP}?`) && new URL(errorBack).searchParams.get("iss") === B, errorBack);
  check(
    "SDK reads that error as OAuthError (iss present, RFC 9207)",
    await rejects(app.finishLogin(errorBack, transaction), (e) => e instanceof OAuthError && e.error === "invalid_request"),
  );

  const silent = await app.startLogin({ prompt: "none" });
  r = await fetch(silent.url, { redirect: "manual" });
  const silentBack = r.headers.get("location") ?? "";
  check(
    "prompt=none without a session -> login_required at the app scheme",
    silentBack.startsWith(`${APP}?`) && (await rejects(app.finishLogin(silentBack, silent.transaction), (e) => e instanceof OAuthError && e.error === "login_required")),
    silentBack,
  );

  const other = new URL(url);
  other.searchParams.set("redirect_uri", "com.attacker.app:/oauth/callback");
  r = await fetch(other, { redirect: "manual" });
  check("an unregistered app scheme -> error page, not the app", (r.headers.get("location") ?? "").includes("/login/error?code=invalid_redirect_uri"), r.headers.get("location"));

  const logoutTo = async (target) => {
    const res = await fetch(app.logoutUrl({ postLogoutRedirectUri: target }), { redirect: "manual" });
    return res.headers.get("location") ?? "";
  };
  check("logout returns to the same app scheme", (await logoutTo("com.seogaemo.dev:/signed-out")).startsWith("com.seogaemo.dev:/signed-out"));
  check("logout refuses another app's scheme", (await logoutTo("com.attacker.app:/signed-out")).includes("/logout?") );
  check("logout refuses a site that is not registered", (await logoutTo("https://evil.example.com/")).includes("/logout?"));
  check("logout still allows the registered web origin", (await logoutTo("http://localhost:5173/bye")).startsWith("http://localhost:5173/bye"));
} finally {
  sql(`UPDATE "Service" SET redirectUris='${JSON.stringify(savedUris)}' WHERE id='svc_dev_public';`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
