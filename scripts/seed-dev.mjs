// 로컬 D1에 테스트용 서비스를 만든다. 사용: pnpm db:seed:local
//   client_id: dev-client / client_secret: dev-secret (confidential)
//   client_id: dev-public (public client, PKCE만)
//   redirect_uri: http://localhost:5173/callback
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const redirectUris = JSON.stringify(["http://localhost:5173/callback"]);
const providers = JSON.stringify(["google", "kakao"]);
const now = new Date().toISOString();

const row = (id, clientId, secretHash, name) =>
  `INSERT OR REPLACE INTO "Service" ("id","clientId","clientSecretHash","name","redirectUris","providers","isSystem","createdAt","updatedAt") ` +
  `VALUES ('${id}','${clientId}','${secretHash}','${name}','${redirectUris}','${providers}',false,'${now}','${now}');`;

const sql = [
  row("svc_dev", "dev-client", sha256("dev-secret"), "Dev Service"),
  row("svc_dev_public", "dev-public", "", "Dev Public App"),
].join("\n");

execFileSync(
  "npx",
  ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--command", sql],
  { stdio: "inherit" },
);
