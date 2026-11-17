// 로컬 D1에 테스트용 서비스를 만든다. 사용: pnpm db:seed:local
//   client_id: dev-client / client_secret: dev-secret (confidential)
//   client_id: dev-public (public client, PKCE만)
//   redirect_uri: http://localhost:5173/callback, post_logout_redirect_uri: http://localhost:5173
//   ID 토큰 서명: dev-client는 RS256, dev-public은 ES256 (둘 다 테스트되게)
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const redirectUris = JSON.stringify(["http://localhost:5173/callback"]);
const postLogoutUris = JSON.stringify(["http://localhost:5173"]);
const providers = JSON.stringify(["password", "email", "google", "kakao"]);
const now = new Date().toISOString();

const row = (id, clientId, secretHash, name, alg) =>
  `INSERT OR REPLACE INTO "Service" ("id","clientId","clientSecretHash","name","redirectUris","postLogoutRedirectUris","idTokenSigningAlg","providers","isSystem","createdAt","updatedAt") ` +
  `VALUES ('${id}','${clientId}','${secretHash}','${name}','${redirectUris}','${postLogoutUris}','${alg}','${providers}',false,'${now}','${now}');`;

// 콘솔용 개발자 (시스템 서비스 svc_console의 사용자). 테스트 서비스들의 소유자다.
const developer =
  `INSERT OR IGNORE INTO "User" ("id","email","name","serviceId","createdAt") ` +
  `VALUES ('usr_dev_owner','dev@example.com','Dev','svc_console','${now}');`;

const sql = [
  developer,
  row("svc_dev", "dev-client", sha256("dev-secret"), "Dev Service", "RS256"),
  row("svc_dev_public", "dev-public", "", "Dev Public App", "ES256"),
  `UPDATE "Service" SET "ownerId" = 'usr_dev_owner' WHERE "id" IN ('svc_dev','svc_dev_public');`,
].join("\n");

execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--command", sql],
  { stdio: "inherit" },
);
