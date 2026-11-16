// 콘솔 로그인(/console/login/start -> /oauth/authorize -> /console/callback) 확인.
// 외부 제공자 단계 대신 authorization code를 DB에 직접 넣는다. 실행 방법은 e2e-local.mjs와 같다.
// 필요: 로컬 D1에 svc_console(0002 마이그레이션)과 개발자 사용자 usr_dev_owner
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
const B="http://localhost:8787";
let r = await fetch(B+"/console/login/start",{redirect:"manual"});
const raw = r.headers.get("set-cookie").split(";")[0];
const saved = JSON.parse(decodeURIComponent(raw.split("=").slice(1).join("=")));
const authorize = r.headers.get("location");
r = await fetch(authorize,{redirect:"manual"});
console.log("authorize ->", r.status, r.headers.get("location"));
const code = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(code).digest("hex");
const challenge = createHash("sha256").update(saved.verifier).digest("base64url");
execFileSync("npx",["wrangler","d1","execute","db.auth.seogaemo.com","--local","--command",`INSERT INTO "AuthorizationCode" (codeHash, serviceId, userId, redirectUri, scope, codeChallenge, codeChallengeMethod, expiresAt, createdAt) VALUES ('${hash}','svc_console','usr_dev_owner','${B}/console/callback','openid email profile','${challenge}','S256','${new Date(Date.now()+300000).toISOString()}','${new Date().toISOString()}');`],{stdio:"pipe"});
r = await fetch(`${B}/console/callback?code=${code}&state=${saved.state}&iss=${encodeURIComponent(B)}`,{redirect:"manual",headers:{cookie:raw}});
const session = (r.headers.getSetCookie?.() ?? []).find(c=>c.startsWith("sg_console="));
console.log("callback ->", r.status, r.headers.get("location"), session ? "session set" : "NO SESSION");
const s = session.split(";")[0];
r = await fetch(B+"/console",{redirect:"manual",headers:{cookie:s}});
console.log("console with session ->", r.status);
r = await fetch(`${B}/console/callback?code=${code}&state=${saved.state}&iss=${encodeURIComponent(B)}`,{redirect:"manual",headers:{cookie:raw}});
console.log("replay ->", r.status, r.headers.get("location"));
r = await fetch(`${B}/console/callback?code=x&state=wrong&iss=${encodeURIComponent(B)}`,{redirect:"manual",headers:{cookie:raw}});
console.log("bad state ->", r.status, r.headers.get("location"));
