// 로그인 유지(SSO 세션), prompt, max_age, 로그아웃, 정지, 계정 화면, 새 콘솔 화면 확인.
// 실행 방법은 e2e-local.mjs와 같다. 세션은 로그인 화면을 거치지 않고 DB에 직접 넣는다.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const B = "http://localhost:8787";
const R = "http://localhost:5173/callback";
const b64u = (b) => Buffer.from(b).toString("base64url");
const sha = (v) => createHash("sha256").update(v).digest();
const hex = (v) => sha(v).toString("hex");
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`); };
const get = (p, h = {}) => fetch(p.startsWith("http") ? p : B + p, { redirect: "manual", headers: h });
const form = (p, body, h = {}) => fetch(B + p, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...h }, body: new URLSearchParams(body) });
const sql = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--command", s], { stdio: "pipe" }).toString();
const now = () => new Date().toISOString();

const browser = b64u(randomBytes(32));
const bc = `sg_browser=${browser}`;
sql(`DELETE FROM "User" WHERE id = 'usr_s1';
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_s1','s1@example.com','S1','svc_dev','${now()}');
INSERT INTO "Session" (id, browserHash, serviceId, userId, authTime, method, lastSeenAt, expiresAt, createdAt) VALUES ('ses_s1','${hex(browser)}','svc_dev','usr_s1','${now()}','password','${now()}','${new Date(Date.now() + 86400000).toISOString()}','${now()}');
UPDATE "Service" SET signupEnabled = 1 WHERE id = 'svc_dev';`);

function authorizeUrl(extra = "") {
  const verifier = b64u(randomBytes(32));
  const challenge = b64u(sha(verifier));
  return { verifier, url: `/oauth/authorize?client_id=dev-client&redirect_uri=${encodeURIComponent(R)}&response_type=code&scope=openid%20email&state=st&nonce=nn&code_challenge=${challenge}&code_challenge_method=S256${extra}` };
}
const loc = (r) => r.headers.get("location") ?? "";
async function exchange(location, verifier) {
  const code = new URL(location).searchParams.get("code");
  const r = await form("/oauth/token", { grant_type: "authorization_code", code, redirect_uri: R, code_verifier: verifier, client_id: "dev-client", client_secret: "dev-secret" });
  return r.json();
}
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

const disc = await (await get("/.well-known/openid-configuration")).json();
check("discovery end_session + prompts", disc.end_session_endpoint === B + "/oauth/logout" && disc.prompt_values_supported?.includes("none"));

// 쿠키 없으면 브라우저 쿠키를 심고 로그인 화면으로
let a = authorizeUrl();
let r = await get(a.url);
check("no session -> /login + sg_browser cookie", loc(r).endsWith("/login") && (r.headers.get("set-cookie") ?? "").includes("sg_browser="), loc(r));

// 세션이 있으면 바로 code
a = authorizeUrl();
r = await get(a.url, { cookie: bc });
check("session -> code without login", loc(r).startsWith(R) && loc(r).includes("code=") && loc(r).includes("state=st"), loc(r));
const tokens = await exchange(loc(r), a.verifier);
const id = claims(tokens.id_token);
check("id_token sid + auth_time", id.sid === "ses_s1" && typeof id.auth_time === "number" && id.nonce === "nn", JSON.stringify(id));
check("refresh token tied to session", sql(`SELECT sessionId FROM RefreshToken WHERE userId='usr_s1' AND revokedAt IS NULL`).includes("ses_s1"));

r = await get(authorizeUrl("&prompt=none").url);
check("prompt=none without session -> login_required", loc(r).startsWith(R) && loc(r).includes("error=login_required"), loc(r));
r = await get(authorizeUrl("&prompt=none").url, { cookie: bc });
check("prompt=none with session -> code", loc(r).includes("code="), loc(r));
r = await get(authorizeUrl("&prompt=none%20login").url, { cookie: bc });
check("prompt=none+login -> invalid_request", loc(r).includes("error=invalid_request"), loc(r));
r = await get(authorizeUrl("&prompt=login").url, { cookie: bc });
check("prompt=login -> /login", loc(r).endsWith("/login"), loc(r));
r = await get(authorizeUrl("&prompt=select_account").url, { cookie: bc });
check("prompt=select_account -> /login/continue", loc(r).endsWith("/login/continue"), loc(r));
const tx = r.headers.get("set-cookie").match(/sg_login_tx=[^;]+/)[0];
r = await get("/login/continue", { cookie: `${bc}; ${tx}` });
const cont = (await r.text()).replace(/<!-- -->/g, "");
check("continue page shows account", r.status === 200 && cont.includes("s1@example.com") && cont.includes("이 계정으로 계속"), `${r.status}`);
await new Promise((ok) => setTimeout(ok, 1100));
r = await get(authorizeUrl("&max_age=0").url, { cookie: bc });
check("max_age=0 -> /login", loc(r).endsWith("/login"), loc(r));
r = await get(authorizeUrl("&max_age=3600").url, { cookie: bc });
check("max_age=3600 -> code", loc(r).includes("code="), loc(r));
r = await get(authorizeUrl("&login_hint=hint%40example.com&prompt=login").url, { cookie: bc });
const tx2 = r.headers.get("set-cookie").match(/sg_login_tx=[^;]+/)[0];
r = await get("/login", { cookie: `${bc}; ${tx2}` });
check("login_hint prefills email", (await r.text()).includes('value="hint@example.com"'));

// 정지
sql(`UPDATE "User" SET disabledAt = '${now()}' WHERE id = 'usr_s1';`);
r = await get(authorizeUrl().url, { cookie: bc });
check("disabled -> no silent login", loc(r).endsWith("/login"), loc(r));
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: "dev-client", client_secret: "dev-secret" });
check("disabled -> refresh invalid_grant", r.status === 400 && (await r.json()).error === "invalid_grant");
r = await get("/oauth/userinfo", { authorization: `Bearer ${tokens.access_token}` });
check("disabled -> userinfo 401", r.status === 401);
sql(`UPDATE "User" SET disabledAt = NULL WHERE id = 'usr_s1';`);

// 접근 제한 목록 밖이 되면 세션으로도 못 들어온다
sql(`UPDATE "Service" SET restrictLogin = 1, allowedEmails = '["other.example"]' WHERE id = 'svc_dev';`);
r = await get(authorizeUrl().url, { cookie: bc });
check("allowlist excludes session user -> /login", loc(r).endsWith("/login"), loc(r));
sql(`UPDATE "Service" SET allowedEmails = '["example.com"]' WHERE id = 'svc_dev';`);
r = await get(authorizeUrl().url, { cookie: bc });
check("allowlist includes domain -> code", loc(r).includes("code="), loc(r));
sql(`UPDATE "Service" SET restrictLogin = 0, allowedEmails = '[]' WHERE id = 'svc_dev';`);

// 새 세션 토큰으로 로그아웃
a = authorizeUrl();
r = await get(a.url, { cookie: bc });
const t2 = await exchange(loc(r), a.verifier);
r = await get(`/oauth/logout?id_token_hint=${t2.id_token}&post_logout_redirect_uri=${encodeURIComponent("http://localhost:5173/")}&state=bye`, { cookie: bc });
check("logout -> post_logout_redirect_uri with state", loc(r) === "http://localhost:5173/?state=bye", loc(r));
check("logout removed session", !sql(`SELECT id FROM Session WHERE id='ses_s1'`).includes("ses_s1"));
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: t2.refresh_token, client_id: "dev-client", client_secret: "dev-secret" });
check("logout revoked session refresh token", r.status === 400);
r = await get(authorizeUrl().url, { cookie: bc });
check("after logout -> /login", loc(r).endsWith("/login"), loc(r));
r = await get(`/oauth/logout?id_token_hint=${t2.id_token}&post_logout_redirect_uri=${encodeURIComponent("https://evil.example/")}`, { cookie: bc });
check("logout bad redirect -> our page", loc(r).includes("/logout?client_id=dev-client&error=invalid_redirect"), loc(r));
// id_token_hint가 없으면 먼저 묻는다 (다른 사이트가 몰래 로그아웃시키지 못하게)
r = await get(`/oauth/logout?client_id=dev-client&post_logout_redirect_uri=${encodeURIComponent("http://localhost:5173")}`, { cookie: bc });
check("logout without hint -> confirm page", loc(r).startsWith(`${B}/logout/confirm?client_id=dev-client`), loc(r));
r = await get(loc(r));
check("confirm page asks", r.status === 200 && (await r.text()).includes("로그아웃할까요?"));
r = await form("/oauth/logout", { client_id: "dev-client", post_logout_redirect_uri: "http://localhost:5173" }, { cookie: bc, origin: "https://evil.example" });
check("cross-site POST -> confirm page too", loc(r).startsWith(`${B}/logout/confirm`), loc(r));
r = await form("/oauth/logout", { client_id: "dev-client", post_logout_redirect_uri: "http://localhost:5173" }, { cookie: bc, origin: B });
check("POST from our confirm page -> logs out and returns", r.status === 303 && loc(r) === "http://localhost:5173/", `${r.status} ${loc(r)}`);
r = await get(`/oauth/logout?id_token_hint=bad.token.here`, { cookie: bc });
check("logout bad hint -> error page", loc(r).includes("error=invalid_hint"), loc(r));
r = await get("/logout?client_id=dev-client");
check("logout page 200", r.status === 200 && (await r.text()).includes("로그아웃했어요"));

// 계정 화면
r = await get("/account?client_id=dev-client", { cookie: bc });
check("account without session -> account login", r.status === 307 && loc(r).includes("/account/login?client_id=dev-client"), `${r.status} ${loc(r)}`);
r = await get("/account/login?client_id=dev-client", { cookie: bc });
check("account login -> /login with tx", loc(r).endsWith("/login") && (r.headers.get("set-cookie") ?? "").includes("sg_login_tx="), loc(r));
check("account tx has returnTo", sql(`SELECT returnTo FROM LoginTransaction ORDER BY createdAt DESC LIMIT 1`).includes("/account?client_id=dev-client"));
sql(`INSERT INTO "Session" (id, browserHash, serviceId, userId, authTime, method, lastSeenAt, expiresAt, createdAt) VALUES ('ses_s2','${hex(browser)}','svc_dev','usr_s1','${now()}','password','${now()}','${new Date(Date.now() + 86400000).toISOString()}','${now()}');`);
r = await get("/account?client_id=dev-client", { cookie: bc });
const acc = (await r.text()).replace(/<!-- -->/g, "");
check("account page", r.status === 200 && acc.includes("내 계정") && acc.includes("이 기기") && acc.includes("탈퇴"), `${r.status}`);
// 콘솔 계정도 계정 화면이 있다. 이 브라우저에 콘솔 세션이 없으면 로그인부터
r = await get("/account?client_id=seogaemo-console", { cookie: bc });
check("console account needs login", r.status === 307 && loc(r).includes("/account/login?client_id=seogaemo-console"), loc(r));
// client_id 없이 오면 이 브라우저에 로그인된 앱이 하나뿐이니 바로 그 계정으로
r = await get("/account", { cookie: bc });
check("account chooser jumps to the only app", r.status === 307 && loc(r).includes("/account?client_id=dev-client"), loc(r));
r = await get("/account");
check("account chooser without sessions", r.status === 200 && (await r.text()).includes("로그인된 앱이 없어요"));

// 가입 설정
sql(`UPDATE "Service" SET signupEnabled = 0 WHERE id = 'svc_dev';`);
a = authorizeUrl("&prompt=login");
r = await get(a.url, { cookie: bc });
const tx3 = r.headers.get("set-cookie").match(/sg_login_tx=[^;]+/)[0];
r = await get("/login", { cookie: `${bc}; ${tx3}` });
check("signup off hides signup link", !(await r.text()).includes("회원가입"));
sql(`UPDATE "Service" SET signupEnabled = 1 WHERE id = 'svc_dev'; DELETE FROM "User" WHERE id = 'usr_s1';`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
