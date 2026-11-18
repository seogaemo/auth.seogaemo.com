// 로컬 Workers에 대고 OAuth 흐름 전체를 확인하는 스크립트.
// 외부 제공자(Google) 로그인 단계는 실제로 못 하므로, 콜백이 만드는 authorization code를 DB에 직접 넣어 이어간다.
//
// 사용:
//   pnpm db:migrate:local && pnpm db:seed:local
//   npx opennextjs-cloudflare build
//   npx wrangler dev --port 8787 --var GOOGLE_CLIENT_ID:test --var GOOGLE_CLIENT_SECRET:test
//   node scripts/e2e-local.mjs
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const B = "http://localhost:8787";
const b64u = (b) => Buffer.from(b).toString("base64url");
const sha = (v) => createHash("sha256").update(v).digest();
const hex = (v) => sha(v).toString("hex");
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`); };
const get = (p, h = {}) => fetch(B + p, { redirect: "manual", headers: h });
const form = (p, body, h = {}) => fetch(B + p, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...h }, body: new URLSearchParams(body) });
const sql = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--command", s], { stdio: "pipe" });

sql(`DELETE FROM "User" WHERE id = 'usr_e2e';`);
const disc = await (await get("/.well-known/openid-configuration")).json();
check("discovery issuer", disc.issuer === B && disc.token_endpoint === B + "/oauth/token");

let r = await get("/oauth/authorize?client_id=nope&redirect_uri=x");
check("unknown client -> error page", r.headers.get("location")?.includes("/login/error?code=invalid_client"));
r = await get("/oauth/authorize?client_id=dev-client&redirect_uri=https://evil.example/cb");
check("unregistered redirect -> error page", r.headers.get("location")?.includes("code=invalid_redirect_uri"));
r = await get("/oauth/authorize?client_id=dev-client&redirect_uri=http://localhost:5173/callback&response_type=code&state=s1");
check("missing PKCE -> client error", r.headers.get("location")?.startsWith("http://localhost:5173/callback?error=invalid_request") && r.headers.get("location").includes("state=s1"));

const verifier = b64u(randomBytes(32));
const challenge = b64u(sha(verifier));
r = await get(`/oauth/authorize?client_id=dev-client&redirect_uri=${encodeURIComponent("http://localhost:5173/callback")}&response_type=code&scope=openid%20email%20profile&state=s2&nonce=n2&code_challenge=${challenge}&code_challenge_method=S256`);
const cookie = r.headers.get("set-cookie")?.split(";")[0];
check("authorize -> /login with cookie", r.status === 302 && r.headers.get("location").endsWith("/login") && cookie?.startsWith("sg_login_tx="), `${r.status} ${r.headers.get("location")}`);

r = await get("/login", { cookie });
const html = (await r.text()).replace(/<!-- -->/g, "");
check("login page lists google", r.status === 200 && html.includes("Google로 로그인") && html.includes("Dev Service"));
r = await get("/login");
check("login without cookie -> expired", (r.headers.get("location") ?? "").includes("code=expired") || r.status === 307, `${r.status}`);

r = await get("/oauth/provider/google/start", { cookie });
const g = new URL(r.headers.get("location"));
check("start -> google with PKCE", g.host === "accounts.google.com" && g.searchParams.get("code_challenge_method") === "S256" && g.searchParams.get("redirect_uri") === B + "/oauth/provider/google/callback");
r = await get(`/oauth/provider/google/callback?code=x&state=${g.searchParams.get("state")}`);
check("callback without cookie rejected", r.headers.get("location")?.includes("code=expired"));
r = await get(`/oauth/provider/google/callback?state=wrong&code=x`, { cookie });
check("callback wrong state rejected", r.headers.get("location")?.includes("code=expired"));
r = await get(`/oauth/provider/google/callback?state=${g.searchParams.get("state")}&error=access_denied`, { cookie });
const back = new URL(r.headers.get("location"));
check("cancel -> client access_denied with state+iss", back.searchParams.get("error") === "access_denied" && back.searchParams.get("state") === "s2" && back.searchParams.get("iss") === B);

// 외부 제공자 단계는 건너뛰고, 콜백이 만드는 것과 같은 code를 직접 넣는다
const code = b64u(randomBytes(32));
const exp = new Date(Date.now() + 300000).toISOString();
sql(`INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_e2e','e2e@example.com','E2E','svc_dev','${new Date().toISOString()}');
INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, nonce, codeChallenge, codeChallengeMethod, expiresAt, createdAt) VALUES ('${hex(code)}','svc_dev','usr_e2e','http://localhost:5173/callback','openid email profile','n2','${challenge}','S256','${exp}','${new Date().toISOString()}');`);

const basic = { authorization: "Basic " + Buffer.from("dev-client:dev-secret").toString("base64") };
const tokenBody = { grant_type: "authorization_code", code, redirect_uri: "http://localhost:5173/callback", code_verifier: verifier };
r = await form("/oauth/token", tokenBody, { authorization: "Basic " + Buffer.from("dev-client:wrong").toString("base64") });
check("wrong secret -> 401", r.status === 401);
r = await form("/oauth/token", { ...tokenBody, code_verifier: b64u(randomBytes(32)) }, basic);
check("wrong verifier -> invalid_grant", (await r.json()).error === "invalid_grant");
r = await form("/oauth/token", tokenBody, basic);
const tok = await r.json();
check("code exchange -> tokens", r.status === 200 && tok.access_token && tok.id_token && tok.refresh_token, JSON.stringify(tok));
const idp = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url"));
check("id_token claims", idp.nonce === "n2" && idp.aud === "dev-client" && idp.email === "e2e@example.com" && idp.iss === B);
r = await form("/oauth/token", tokenBody, basic);
check("code reuse -> invalid_grant", (await r.json()).error === "invalid_grant");

r = await get("/oauth/userinfo", { authorization: "Bearer " + tok.access_token });
const ui = await r.json();
check("userinfo", ui.sub === "usr_e2e" && ui.email === "e2e@example.com" && ui.name === "E2E" && ui.preferred_username === "E2E", JSON.stringify(ui));
r = await get("/oauth/userinfo", { authorization: "Bearer " + tok.id_token });
check("id_token rejected at userinfo", r.status === 401);

// code 재사용 시 토큰을 끊으므로, 새 code로 다시 받는다
const code2 = b64u(randomBytes(32));
sql(`INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, nonce, codeChallenge, codeChallengeMethod, expiresAt, createdAt) VALUES ('${hex(code2)}','svc_dev','usr_e2e','http://localhost:5173/callback','openid email','n3','${challenge}','S256','${exp}','${new Date().toISOString()}');`);
const t2 = await (await form("/oauth/token", { ...tokenBody, code: code2 }, basic)).json();
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: t2.refresh_token }, basic);
const t3 = await r.json();
check("refresh rotates", r.status === 200 && t3.refresh_token && t3.refresh_token !== t2.refresh_token);
// 회전 유예 시간(기본 30초)이 지난 재사용이어야 유출로 본다
sql(`UPDATE "RefreshToken" SET rotatedAt = '${new Date(Date.now() - 120_000).toISOString()}' WHERE tokenHash = '${hex(t2.refresh_token)}';`);
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: t2.refresh_token }, basic);
check("old refresh reuse -> invalid_grant", (await r.json()).error === "invalid_grant");
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: t3.refresh_token }, basic);
check("reuse detection revoked newest too", (await r.json()).error === "invalid_grant");

const code3 = b64u(randomBytes(32));
sql(`INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod, expiresAt, createdAt) VALUES ('${hex(code3)}','svc_dev','usr_e2e','http://localhost:5173/callback','openid','${challenge}','S256','${exp}','${new Date().toISOString()}');`);
const t4 = await (await form("/oauth/token", { ...tokenBody, code: code3 }, basic)).json();
r = await form("/oauth/revoke", { token: t4.refresh_token }, basic);
check("revoke 200", r.status === 200);
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: t4.refresh_token }, basic);
check("revoked refresh unusable", (await r.json()).error === "invalid_grant");

r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: "x", client_id: "dev-public", client_secret: "anything" });
check("public client with secret -> 401", r.status === 401);
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: "x", client_id: "dev-client" });
check("confidential without secret -> 401", r.status === 401);
r = await fetch(B + "/oauth/token", { method: "OPTIONS" });
check("CORS preflight", r.status === 204 && r.headers.get("access-control-allow-origin") === "*");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
