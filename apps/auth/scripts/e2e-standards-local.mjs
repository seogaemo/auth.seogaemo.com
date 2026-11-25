// 표준 적합성 확인. 각 검사 이름 끝의 괄호가 근거 조항이다.
// 사용 (e2e-local.mjs와 같은 준비 뒤): node scripts/e2e-standards-local.mjs
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const B = process.env.E2E_BASE ?? "http://localhost:8787";
const R = "http://localhost:5173/callback";
const b64u = (b) => Buffer.from(b).toString("base64url");
const sha = (v) => createHash("sha256").update(v).digest();
const hex = (v) => sha(v).toString("hex");
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`); };
const get = (p, h = {}) => fetch(p.startsWith("http") ? p : B + p, { redirect: "manual", headers: h });
const form = (p, body, h = {}) => fetch(B + p, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...h }, body: typeof body === "string" ? body : new URLSearchParams(body) });
const sql = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--command", s], { stdio: "pipe" }).toString();
const loc = (r) => r.headers.get("location") ?? "";
const now = () => new Date().toISOString();
const decode = (jwt, part = 1) => JSON.parse(Buffer.from(jwt.split(".")[part], "base64url").toString());
const DEV = { client_id: "dev-client", client_secret: "dev-secret" };

const verifier = b64u(randomBytes(32));
const challenge = b64u(sha(verifier));
const authorizeQuery = (extra = {}) =>
  new URLSearchParams({ client_id: "dev-client", redirect_uri: R, response_type: "code", scope: "openid email", state: "st", nonce: "nn", code_challenge: challenge, code_challenge_method: "S256", ...extra });

/** 로그인 화면을 건너뛰고 code를 만든다 */
function issueCode(authTime = now()) {
  const code = b64u(randomBytes(32));
  sql(`INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, nonce, codeChallenge, codeChallengeMethod, authTime, expiresAt, createdAt)
VALUES ('${hex(code)}','svc_dev','usr_std','${R}','openid email profile','nn','${challenge}','S256','${authTime}','${new Date(Date.now() + 300000).toISOString()}','${now()}');`);
  return code;
}
async function tokens(authTime) {
  const r = await form("/oauth/token", { grant_type: "authorization_code", code: issueCode(authTime), redirect_uri: R, code_verifier: verifier, ...DEV });
  return r.json();
}

const browser = b64u(randomBytes(32));
const bc = `sg_browser=${browser}`;
sql(`DELETE FROM "User" WHERE id = 'usr_std';
INSERT INTO "User" (id, email, name, serviceId, createdAt) VALUES ('usr_std','std@example.com','Std','svc_dev','${now()}');
INSERT INTO "Session" (id, browserHash, serviceId, userId, authTime, method, lastSeenAt, expiresAt, createdAt) VALUES ('ses_std','${hex(browser)}','svc_dev','usr_std','${now()}','password','${now()}','${new Date(Date.now() + 86400000).toISOString()}','${now()}');`);

console.log("--- discovery, JWKS");
const disc = await (await get("/.well-known/openid-configuration")).json();
check("RS256 is advertised (OIDC Discovery 3)", disc.id_token_signing_alg_values_supported?.includes("RS256"), JSON.stringify(disc.id_token_signing_alg_values_supported));
check("request_uri_parameter_supported=false (Discovery 3, default is true)", disc.request_uri_parameter_supported === false && disc.request_parameter_supported === false);
check("response_modes_supported=[query]", JSON.stringify(disc.response_modes_supported) === '["query"]');
check("subject_types_supported=[pairwise] (sub differs per app)", JSON.stringify(disc.subject_types_supported) === '["pairwise"]');
check("amr is in claims_supported", disc.claims_supported?.includes("amr"));
let r = await get("/.well-known/jwks.json", { origin: "https://app.example.com" });
const jwks = await r.json();
check("JWKS readable from browsers (CORS)", r.headers.get("access-control-allow-origin") === "*");
check("JWKS has an RSA and an EC key", jwks.keys.some((k) => k.kty === "RSA" && k.alg === "RS256") && jwks.keys.some((k) => k.kty === "EC"));
check("JWKS exposes no private parts", jwks.keys.every((k) => !("d" in k) && !("p" in k) && !("q" in k)));

console.log("--- authorization endpoint");
r = await form("/oauth/authorize", authorizeQuery({ prompt: "login" }), { cookie: bc });
check("POST is accepted (OIDC Core 3.1.2.1)", r.status === 303 && loc(r).endsWith("/login"), `${r.status} ${loc(r)}`);
r = await get(`/oauth/authorize?${authorizeQuery({ request_uri: "https://x.example/r" })}`);
check("request_uri -> request_uri_not_supported (Core 6.2)", new URL(loc(r)).searchParams.get("error") === "request_uri_not_supported", loc(r));
r = await get(`/oauth/authorize?${authorizeQuery({ request: "e.y.j" })}`);
check("request -> request_not_supported (Core 6.1)", new URL(loc(r)).searchParams.get("error") === "request_not_supported", loc(r));
r = await get(`/oauth/authorize?${authorizeQuery({ response_mode: "fragment" })}`);
check("response_mode=fragment -> error, not a silent query response", new URL(loc(r)).searchParams.get("error") === "invalid_request" && new URL(loc(r)).searchParams.get("iss") === B, loc(r));
r = await get(`/oauth/authorize?${authorizeQuery({ response_mode: "query" })}`, { cookie: bc });
check("response_mode=query still works", new URL(loc(r)).searchParams.has("code"), loc(r));
r = await get(`/oauth/authorize?${authorizeQuery()}&state=again`);
check("repeated parameter -> invalid_request (RFC 6749 3.1)", new URL(loc(r)).searchParams.get("error") === "invalid_request", loc(r));
r = await get(`/oauth/authorize?${authorizeQuery()}&client_id=dev-public`);
check("repeated client_id -> our error page, not a redirect", loc(r).includes("/login/error?code=invalid_request"), loc(r));
r = await get(`/oauth/authorize?${authorizeQuery({ prompt: "consent" })}`, { cookie: bc });
check("prompt=consent with a session asks first (Core 3.1.2.1)", loc(r).endsWith("/login/continue"), loc(r));
r = await get(`/oauth/authorize?${authorizeQuery()}`, { cookie: bc });
check("without prompt the session still continues silently", new URL(loc(r)).searchParams.has("code"), loc(r));

console.log("--- auth_time, amr (RFC 9068 2.2.1, RFC 8176)");
{
  const viaSession = await (await form("/oauth/token", { grant_type: "authorization_code", code: new URL(loc(r)).searchParams.get("code"), redirect_uri: R, code_verifier: verifier, ...DEV })).json();
  const at = decode(viaSession.access_token), it = decode(viaSession.id_token);
  check("password session -> amr [pwd] in the ID token", JSON.stringify(it.amr) === '["pwd"]', JSON.stringify(it));
  check("access token carries amr and auth_time too", JSON.stringify(at.amr) === '["pwd"]' && at.auth_time === it.auth_time && typeof at.auth_time === "number", JSON.stringify(at));
  const again = await (await form("/oauth/token", { grant_type: "refresh_token", refresh_token: viaSession.refresh_token, ...DEV })).json();
  check("refresh keeps amr and auth_time in both tokens", JSON.stringify(decode(again.access_token).amr) === '["pwd"]' && decode(again.access_token).auth_time === at.auth_time && JSON.stringify(decode(again.id_token).amr) === '["pwd"]', JSON.stringify(decode(again.access_token)));
}

console.log("--- token endpoint");
const t = await tokens();
check("ID token signed with the app's alg (RS256 for dev-client)", decode(t.id_token, 0).alg === "RS256");
check("access token has jti (RFC 9068 2.2)", typeof decode(t.access_token).jti === "string");
const t2 = await tokens();
check("jti differs per token", decode(t.access_token).jti !== decode(t2.access_token).jti);
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: "x", ...DEV });
check("token responses send Pragma: no-cache (RFC 6749 5.1)", r.headers.get("pragma") === "no-cache" && r.headers.get("cache-control") === "no-store");
r = await form("/oauth/token", { ...DEV });
check("missing grant_type -> invalid_request (RFC 6749 5.2)", (await r.json()).error === "invalid_request");
r = await form("/oauth/token", `grant_type=refresh_token&refresh_token=${t.refresh_token}&refresh_token=x&client_id=dev-client&client_secret=dev-secret`);
check("repeated parameter -> invalid_request", (await r.json()).error === "invalid_request");
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: t.refresh_token, scope: "openid email profile admin", ...DEV });
check("refresh asking for more scope -> invalid_scope", (await r.json()).error === "invalid_scope");
const authTime = new Date(Date.now() - 3600_000).toISOString();
const old = await tokens(authTime);
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: old.refresh_token, scope: "openid email profile admin", ...DEV });
r = await form("/oauth/token", { grant_type: "refresh_token", refresh_token: old.refresh_token, ...DEV });
const refreshed = await r.json();
check("a rejected scope request does not burn the refresh token (RFC 6749 6)", r.status === 200 && typeof refreshed.refresh_token === "string", JSON.stringify(refreshed));
check("refreshed ID token keeps the original auth_time (Core 12.2)", decode(refreshed.id_token).auth_time === Math.floor(Date.parse(authTime) / 1000), JSON.stringify(decode(refreshed.id_token)));
check("refreshed ID token has no nonce (Core 12.2)", decode(refreshed.id_token).nonce === undefined);

console.log("--- revocation");
r = await form("/oauth/revoke", { token: t2.access_token, ...DEV });
check("revoking an access token -> unsupported_token_type (RFC 7009 2.2.1)", r.status === 400 && (await r.json()).error === "unsupported_token_type");
r = await form("/oauth/revoke", { token: "not-a-token", ...DEV });
check("revoking an unknown token -> 200 (RFC 7009 2.2)", r.status === 200);
r = await form("/oauth/revoke", { token: t2.refresh_token, token_type_hint: "refresh_token", ...DEV });
check("revoking a refresh token -> 200", r.status === 200);

console.log("--- userinfo");
r = await get("/oauth/userinfo");
check("no token -> 401 without an error code (RFC 6750 3.1)", r.status === 401 && !/error=/.test(r.headers.get("www-authenticate") ?? "") && /^Bearer/.test(r.headers.get("www-authenticate") ?? ""), r.headers.get("www-authenticate"));
r = await get("/oauth/userinfo", { authorization: `bearer ${t.access_token}` });
check("auth scheme is case-insensitive (RFC 9110 11.1)", r.status === 200, `${r.status}`);
r = await get("/oauth/userinfo", { authorization: "Bearer a b c" });
check("malformed header -> 400 invalid_request (RFC 6750 3.1)", r.status === 400 && /error="invalid_request"/.test(r.headers.get("www-authenticate") ?? ""));
r = await get("/oauth/userinfo", { authorization: "Bearer nope" });
check("bad token -> 401 invalid_token", r.status === 401 && /error="invalid_token"/.test(r.headers.get("www-authenticate") ?? ""));
const emailOnly = b64u(randomBytes(32));
sql(`INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod, expiresAt, createdAt)
VALUES ('${hex(emailOnly)}','svc_dev','usr_std','${R}','email','${challenge}','S256','${new Date(Date.now() + 300000).toISOString()}','${now()}');`);
const plain = await (await form("/oauth/token", { grant_type: "authorization_code", code: emailOnly, redirect_uri: R, code_verifier: verifier, ...DEV })).json();
r = await get("/oauth/userinfo", { authorization: `Bearer ${plain.access_token}` });
check("token without openid -> 403 insufficient_scope (OIDC Core 5.3)", r.status === 403 && /insufficient_scope/.test(r.headers.get("www-authenticate") ?? ""), `${r.status}`);

console.log("--- refresh token rotation grace (Okta grace period, Auth0 reuse interval)");
const refresh = (token) => form("/oauth/token", { grant_type: "refresh_token", refresh_token: token, ...DEV });
const alive = async (token) => (await refresh(token)).status === 200;
sql(`UPDATE "Service" SET refreshTokenGraceSec = 30 WHERE id = 'svc_dev';`);
{
  const g = await tokens();
  const r1 = await (await refresh(g.refresh_token)).json();
  r = await refresh(g.refresh_token);
  const again = await r.json();
  check("reusing the just-rotated token within the grace period -> new tokens", r.status === 200 && again.refresh_token && again.refresh_token !== r1.refresh_token, JSON.stringify(again));
  check("...and the login is not cut (the other branch still works)", await alive(r1.refresh_token));

  const c = await tokens();
  const [x, y] = await Promise.all([refresh(c.refresh_token), refresh(c.refresh_token)]);
  check("two refreshes at the same moment both succeed", x.status === 200 && y.status === 200, `${x.status} ${y.status}`);

  const old = await tokens();
  const otherDevice = await tokens();
  const o1 = await (await refresh(old.refresh_token)).json();
  sql(`UPDATE "RefreshToken" SET rotatedAt = '${new Date(Date.now() - 31_000).toISOString()}' WHERE tokenHash = '${hex(old.refresh_token)}';`);
  check("reuse after the grace period -> invalid_grant", (await (await refresh(old.refresh_token)).json()).error === "invalid_grant");
  check("...and that login (token family) is cut (theft response)", !(await alive(o1.refresh_token)));
  check("...but the same user's login on another device keeps working", await alive(otherDevice.refresh_token));

  const v = await tokens();
  const v1 = await (await refresh(v.refresh_token)).json();
  await form("/oauth/revoke", { token: v1.refresh_token, ...DEV });
  check("reuse within grace after the newer token was revoked (logout) -> invalid_grant", (await (await refresh(v.refresh_token)).json()).error === "invalid_grant");

  const p = await tokens();
  const q = await tokens();
  await form("/oauth/revoke", { token: p.refresh_token, ...DEV });
  check("reusing a token ended by revoke -> invalid_grant", (await (await refresh(p.refresh_token)).json()).error === "invalid_grant");
  check("...without cutting the user's other logins (not a theft signal)", await alive(q.refresh_token));

  // code를 두 번 쓰면 그 code로 받은 토큰만 끊는다 (RFC 6749 4.1.2)
  const twice = issueCode();
  const first = await (await form("/oauth/token", { grant_type: "authorization_code", code: twice, redirect_uri: R, code_verifier: verifier, ...DEV })).json();
  const bystander = await tokens();
  r = await form("/oauth/token", { grant_type: "authorization_code", code: twice, redirect_uri: R, code_verifier: verifier, ...DEV });
  check("code used twice -> invalid_grant", (await r.json()).error === "invalid_grant");
  check("...and the tokens from that code are cut", !(await alive(first.refresh_token)));
  check("...but other logins of the user are not", await alive(bystander.refresh_token));

  sql(`UPDATE "Service" SET refreshTokenGraceSec = 0 WHERE id = 'svc_dev';`);
  const z = await tokens();
  const z1 = await (await refresh(z.refresh_token)).json();
  check("grace 0 -> immediate reuse is refused", (await (await refresh(z.refresh_token)).json()).error === "invalid_grant");
  check("...and the login is cut", !(await alive(z1.refresh_token)));
  sql(`UPDATE "Service" SET refreshTokenGraceSec = 30 WHERE id = 'svc_dev';`);
}

// wrangler dev가 요청 주소 안의 127.0.0.1을 localhost로 바꿔 넘겨서 로컬에서는 [::1]로 확인한다
console.log("--- loopback redirect (RFC 8252 7.3)");
const saved = JSON.parse(JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--json", "--command", `SELECT redirectUris FROM "Service" WHERE id='svc_dev'`], { stdio: "pipe" }).toString())[0].results[0].redirectUris);
sql(`UPDATE "Service" SET redirectUris='${JSON.stringify([...saved, "http://[::1]/oauth/callback"])}' WHERE id='svc_dev';`);
try {
  r = await get(`/oauth/authorize?${authorizeQuery({ redirect_uri: "http://[::1]:54321/oauth/callback" })}`, { cookie: bc });
  check("[::1] with any port is accepted", loc(r).startsWith("http://[::1]:54321/oauth/callback?code="), loc(r));
  r = await get(`/oauth/authorize?${authorizeQuery({ redirect_uri: "http://[::1]:54321/other" })}`);
  check("but the path must match", loc(r).includes("invalid_redirect_uri"), loc(r));
  r = await get(`/oauth/authorize?${authorizeQuery({ redirect_uri: "http://localhost:9999/callback" })}`);
  check("localhost (a name, not a loopback IP) still needs the exact port", loc(r).includes("invalid_redirect_uri"), loc(r));
} finally {
  sql(`UPDATE "Service" SET redirectUris='${JSON.stringify(saved)}' WHERE id='svc_dev';`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
