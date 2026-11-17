// @seogaemo/oauth-browser, @seogaemo/oauth-next를 로컬 서버에 붙여 흐름 전체를 돌린다.
// 브라우저는 Node에서 흉내 낸다 (저장소, 주소 이동). 외부 제공자 로그인은 e2e-local.mjs처럼 code를 DB에 넣는다.
//
// 사용 (e2e-local.mjs와 같은 준비 뒤):
//   pnpm -r --filter "./packages/**" build
//   node scripts/e2e-sdk-packages-local.mjs
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

import { createBrowserClient } from "@seogaemo/oauth-browser";
import { createCore } from "@seogaemo/oauth-next/core";

const B = process.env.E2E_BASE ?? "http://localhost:8787";
const APP = "http://localhost:5173";
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`); };
const sql = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--command", s], { stdio: "pipe" });
const hex = (v) => createHash("sha256").update(v).digest("hex");

sql(`DELETE FROM "User" WHERE id IN ('usr_pkg','usr_pkg_pub');
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_pkg','pkg@example.com','Pkg','svc_dev','${new Date().toISOString()}');
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_pkg_pub','pkg@example.com','Pkg','svc_dev_public','${new Date().toISOString()}');`);

/** 로그인 화면과 제공자 단계를 건너뛰고, 서버가 콜백에 붙이는 것과 같은 주소를 만든다 */
function serverIssuesCode(authorizeUrl, serviceId, userId) {
  const p = new URL(authorizeUrl).searchParams;
  const code = randomBytes(32).toString("base64url");
  const now = new Date();
  sql(`INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, nonce, codeChallenge, codeChallengeMethod, expiresAt, createdAt, authTime)
VALUES ('${hex(code)}','${serviceId}','${userId}','${p.get("redirect_uri")}','${p.get("scope")}','${p.get("nonce")}','${p.get("code_challenge")}','S256','${new Date(now.getTime() + 300000).toISOString()}','${now.toISOString()}','${now.toISOString()}');`);
  const callback = new URL(p.get("redirect_uri"));
  callback.search = new URLSearchParams({ code, state: p.get("state"), iss: B }).toString();
  return callback.toString();
}

class MemoryStorage {
  map = new Map();
  get length() { return this.map.size; }
  getItem(k) { return this.map.get(k) ?? null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  clear() { this.map.clear(); }
}

console.log("--- @seogaemo/oauth-browser (public client dev-public, ES256)");
{
  const navigations = [];
  let url = `${APP}/`;
  const storage = new MemoryStorage();
  const spa = await createBrowserClient({
    clientId: "dev-public",
    redirectUri: `${APP}/callback`,
    postLogoutRedirectUri: APP,
    issuer: B,
    storage,
    env: {
      transactionStorage: new MemoryStorage(),
      navigate: (to) => navigations.push(to),
      replaceUrl: (to) => (url = to),
      currentUrl: () => url,
      locks: undefined,
      addStorageListener: () => () => {},
    },
  });
  await spa.login({ returnTo: "/after" });
  const authorize = navigations.at(-1);
  const r = await fetch(authorize, { redirect: "manual" });
  check("server accepts the SPA's authorize URL", new URL(r.headers.get("location"), B).pathname === "/login", r.headers.get("location"));

  url = serverIssuesCode(authorize, "svc_dev_public", "usr_pkg_pub");
  const result = await spa.handleCallback();
  check("handleCallback verifies the ES256 ID token and returns returnTo", result.claims.sub === "usr_pkg_pub" && result.returnTo === "/after");
  check("callback params removed from the address bar", !new URL(url).searchParams.has("code"), url);
  const first = await spa.getAccessToken();
  check("access token works against userinfo", (await fetch(`${B}/oauth/userinfo`, { headers: { authorization: `Bearer ${first}` } })).status === 200);

  const key = "seogaemo.session.dev-public";
  storage.setItem(key, JSON.stringify({ ...JSON.parse(storage.getItem(key)), expiresAt: 0 }));
  const second = await spa.getAccessToken();
  check("expired access token is refreshed with the real server", second && second !== first);

  await spa.logout();
  const end = navigations.at(-1);
  const lr = await fetch(end, { redirect: "manual" });
  check("logout goes through end_session with a hint and comes back", lr.headers.get("location") === `${APP}/`, `${lr.status} ${lr.headers.get("location")}`);
  check("SPA session cleared", spa.getUser() === null);
}

console.log("--- @seogaemo/oauth-next (confidential client dev-client, RS256)");
{
  const core = createCore({ clientId: "dev-client", clientSecret: "dev-secret", baseUrl: APP, basePath: "", secret: "s".repeat(40), issuer: B });
  const cookiesOf = (response) =>
    Object.fromEntries(response.headers.getSetCookie().map((line) => { const pair = line.split(";")[0]; const i = pair.indexOf("="); return [pair.slice(0, i), pair.slice(i + 1)]; }));

  const start = await core.handlers.GET(new Request(`${APP}/login?returnTo=/settings`));
  const authorize = start.headers.get("location");
  const r = await fetch(authorize, { redirect: "manual" });
  check("server accepts the Next app's authorize URL", new URL(r.headers.get("location"), B).pathname === "/login", r.headers.get("location"));

  const tx = cookiesOf(start).seogaemo_session_tx;
  const done = await core.handlers.GET(new Request(serverIssuesCode(authorize, "svc_dev", "usr_pkg"), { headers: { cookie: `seogaemo_session_tx=${tx}` } }));
  check("callback logs in (client_secret_basic, RS256 ID token) and returns to returnTo", done.headers.get("location") === `${APP}/settings`, `${done.status} ${done.headers.get("location")}`);
  const sealed = cookiesOf(done).seogaemo_session;
  const session = await core.readSession(decodeURIComponent(sealed));
  check("session cookie holds the verified user", session?.user.sub === "usr_pkg" && session.user.email === "pkg@example.com");

  const refreshed = await core.refreshIfNeeded({ ...session, expiresAt: 0 });
  check("refresh against the real server rotates the token", refreshed.session && refreshed.session.refreshToken !== session.refreshToken && refreshed.cookie);

  const cookie = `seogaemo_session=${encodeURIComponent(refreshed.cookie.value)}`;
  const out = await core.handlers.POST(new Request(`${APP}/logout`, { method: "POST", headers: { cookie, origin: APP } }));
  const end = out.headers.get("location");
  const lr = await fetch(end, { redirect: "manual" });
  check("logout goes through end_session with a hint and comes back", lr.headers.get("location") === `${APP}/`, `${lr.status} ${lr.headers.get("location")}`);
  const after = await fetch(`${B}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${btoa("dev-client:dev-secret")}` },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshed.session.refreshToken }),
  });
  check("refresh token was revoked on logout", after.status === 400);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
