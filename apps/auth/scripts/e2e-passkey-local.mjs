// 패스키(WebAuthn) 로그인을 진짜 브라우저(Chrome)와 가상 인증기(CDP)로 확인한다.
// 확인하는 것: 이메일 코드 로그인 -> 저장하기 -> 다음 로그인은 자동완성으로 패스키 -> 성공, 건너뛰기, 서버에서 지운 패스키,
// 비밀번호만 켠 서비스에서 가입 안 된 이메일 거절, 만료된 진행에서 저장 제안 화면 접근, 청소 규칙.
//
// 사용 (다른 e2e와 달리 ISSUER가 .dev.vars의 주소와 같아야 한다. 기본 http://localhost:8788):
//   pnpm db:migrate:local && pnpm db:seed:local
//   npx opennextjs-cloudflare build
//   npx wrangler dev --port 8788
//   node scripts/e2e-passkey-local.mjs
// 브라우저는 설치된 Chrome을 쓴다 (CHROME_PATH로 바꿀 수 있다). 창을 보려면 HEADED=1.
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const B = process.env.E2E_BASE ?? "http://localhost:8788";
const R = "http://localhost:5173/callback";
const b64u = (b) => Buffer.from(b).toString("base64url");
const sha = (v) => createHash("sha256").update(v).digest();
const hex = (v) => sha(v).toString("hex");
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${ok ? "" : extra}`); };
const d1 = (s) => execFileSync("npx", ["wrangler", "d1", "execute", "db.auth.seogaemo.com", "--local", "--json", "--command", s], { stdio: "pipe" }).toString();
const rows = (s) => JSON.parse(d1(s))[0].results;
const now = () => new Date().toISOString();

const EMAILS = ["pk1@example.com", "pk2@example.com", "pk3@example.com"];
const list = EMAILS.map((e) => `'${e}'`).join(",");
const reset = () => d1(`DELETE FROM "User" WHERE email IN (${list});
DELETE FROM "PasskeyOwner" WHERE email IN (${list});
DELETE FROM "EmailCode" WHERE email IN (${list});
UPDATE "Service" SET providers = '["password","email","google","kakao"]', signupEnabled = 1, restrictLogin = 0 WHERE id IN ('svc_dev','svc_dev_public');`);
reset();

function authorize(clientId = "dev-client", extra = "") {
  const challenge = b64u(sha(b64u(randomBytes(32))));
  return `${B}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(R)}&response_type=code&scope=openid%20email&state=st&code_challenge=${challenge}&code_challenge_method=S256${extra}`;
}

const browser = await chromium.launch({
  headless: !process.env.HEADED,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
});

/** 가상 인증기가 붙은 새 브라우저 (쿠키, 인증기 모두 따로) */
async function newBrowser() {
  const context = await browser.newContext();
  await context.route(`${new URL(R).origin}/**`, (route) => route.fulfill({ status: 200, body: "callback" }));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { context, page, cdp, authenticatorId };
}

/** 이메일을 넣고 코드로 로그인한다. 코드는 DB의 해시를 알려 둔 값으로 바꿔 입력한다. */
async function loginWithCode(page, email) {
  await page.fill("#email", email);
  await page.click("button[type=submit]");
  await page.waitForURL("**/login/verify");
  d1(`UPDATE "EmailCode" SET codeHash = '${hex("123456")}' WHERE email = '${email}' AND consumedAt IS NULL;`);
  await page.fill("#code", "123456");
  await page.click("button[type=submit]");
}

const onCallback = (page) => page.waitForURL((u) => u.href.startsWith(R), { timeout: 15000 });
const ownerPasskeys = (email) => rows(`SELECT p.id, p.counter, p.lastUsedAt FROM "Passkey" p JOIN "PasskeyOwner" o ON o.id = p.ownerId WHERE o.email = '${email}'`);

// 1. 이메일 코드 로그인 -> 저장하기
{
  const { page, cdp, authenticatorId } = await newBrowser();
  await page.goto(authorize());
  check("login page: email input has autocomplete 'username webauthn'", (await page.getAttribute("#email", "autocomplete")) === "username webauthn");
  check("login page: email input focused", await page.evaluate(() => document.activeElement?.id === "email"));
  await loginWithCode(page, EMAILS[0]);
  await page.waitForURL("**/login/passkey");
  check("after code login -> /login/passkey with two buttons", (await page.getByRole("button", { name: "저장하기" }).count()) === 1 && (await page.getByRole("button", { name: "건너뛰기" }).count()) === 1);
  check("no code issued before the prompt", rows(`SELECT count(*) c FROM "AuthorizationCode" WHERE userId IN (SELECT id FROM "User" WHERE email = '${EMAILS[0]}')`)[0].c === 0);
  await page.getByRole("button", { name: "저장하기" }).click();
  await onCallback(page);
  check("저장하기 -> redirected to client with code", new URL(page.url()).searchParams.has("code"), page.url());
  check("passkey saved for owner", ownerPasskeys(EMAILS[0]).length === 1);
  check("virtual authenticator holds the credential", (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials.length === 1);
  check("session method recorded as email", rows(`SELECT method FROM "Session" WHERE userId IN (SELECT id FROM "User" WHERE email = '${EMAILS[0]}')`)[0]?.method === "email");

  // 2. 다음 로그인: 버튼 없이 자동완성으로 패스키
  await page.goto(authorize("dev-client", "&prompt=login"));
  await page.waitForSelector("#email");
  await page.click("#email");
  await onCallback(page).catch(() => {});
  check("conditional UI logs in with passkey (no button)", page.url().startsWith(R) && new URL(page.url()).searchParams.has("code"), page.url());
  const session = rows(`SELECT method FROM "Session" WHERE userId IN (SELECT id FROM "User" WHERE email = '${EMAILS[0]}')`)[0];
  check("session method = passkey", session?.method === "passkey", JSON.stringify(session));
  check("passkey lastUsedAt set", ownerPasskeys(EMAILS[0])[0]?.lastUsedAt != null);
  check("identity passkey recorded", rows(`SELECT providerUserId FROM "Identity" WHERE provider='passkey' AND providerUserId='${EMAILS[0]}'`).length === 1);
  check("login event method passkey", rows(`SELECT count(*) c FROM "LoginEvent" WHERE method='passkey' AND type='login' AND email='${EMAILS[0]}'`)[0].c >= 1);

  // 3. 비밀번호만 켠 서비스에는 이 이메일의 사용자가 없다 -> 새로 만들지 않고 거절
  d1(`UPDATE "Service" SET providers = '["password"]' WHERE id = 'svc_dev_public';`);
  await page.goto(authorize("dev-public"));
  await page.waitForSelector("#email");
  await page.click("#email");
  await page.waitForSelector("[role=alert] p", { timeout: 10000 }).catch(() => {});
  const message = await page.locator("[role=alert] p").first().textContent().catch(() => "");
  check("password-only service rejects passkey without account", message?.includes("가입된 계정이 없어요") && rows(`SELECT count(*) c FROM "User" WHERE serviceId='svc_dev_public' AND email='${EMAILS[0]}'`)[0].c === 0, message ?? "");
  d1(`UPDATE "Service" SET providers = '["password","email","google","kakao"]' WHERE id = 'svc_dev_public';`);

  // 4. 서버에서 지운 패스키: 오류를 보여주고 계정은 만들지 않는다
  d1(`DELETE FROM "Passkey" WHERE ownerId IN (SELECT id FROM "PasskeyOwner" WHERE email = '${EMAILS[0]}');`);
  await page.goto(authorize("dev-client", "&prompt=login"));
  await page.waitForSelector("#email");
  await page.click("#email");
  await page.waitForSelector("[role=alert] p", { timeout: 10000 }).catch(() => {});
  const unknown = await page.locator("[role=alert] p").first().textContent().catch(() => "");
  check("deleted passkey -> error shown", unknown?.includes("서버에 없는 패스키"), unknown ?? "");
  check("unknown passkey recorded as failure", rows(`SELECT count(*) c FROM "LoginEvent" WHERE reason='unknown_passkey'`)[0].c >= 1);
  await page.context().close();
}

// 5. 건너뛰기
{
  const { page } = await newBrowser();
  await page.goto(authorize());
  await loginWithCode(page, EMAILS[1]);
  await page.waitForURL("**/login/passkey");
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await onCallback(page);
  check("건너뛰기 -> code issued", new URL(page.url()).searchParams.has("code"), page.url());
  check("nothing saved on skip", ownerPasskeys(EMAILS[1]).length === 0);
  await page.context().close();
}

// 6. 로그인 확인 없이 저장 제안 화면, 다른 서비스 로그인 확인
{
  const { page } = await newBrowser();
  await page.goto(authorize());
  await page.goto(`${B}/login/passkey`);
  check("/login/passkey without verified login -> back to /login", new URL(page.url()).pathname === "/login", page.url());
  await page.goto(`${B}/login/passkey/begin`);
  check("/login/passkey/begin without verified login -> /login", new URL(page.url()).pathname === "/login", page.url());
  await page.context().close();
}

// 7. 청소: 이메일의 사용자가 어느 서비스에도 없으면 소유자와 패스키가 지워진다 (실제 cleanupExpired를 로컬 D1에 연결해 실행)
{
  const KEPT = "kept-e2e@example.com";
  d1(`DELETE FROM "PasskeyOwner" WHERE id IN ('own_e2e_orphan','own_e2e_kept');
DELETE FROM "User" WHERE id = 'usr_e2e_kept';
INSERT INTO "User" (id, email, serviceId, createdAt) VALUES ('usr_e2e_kept','${KEPT}','svc_dev','${now()}');
INSERT INTO "PasskeyOwner" (id, email, createdAt) VALUES ('own_e2e_orphan','orphan-e2e@example.com','${now()}'), ('own_e2e_kept','${KEPT}','${now()}');
INSERT INTO "Passkey" (id, ownerId, publicKey, deviceType, createdAt) VALUES ('cred_e2e_orphan','own_e2e_orphan','x','singleDevice','${now()}'), ('cred_e2e_kept','own_e2e_kept','x','singleDevice','${now()}');`);
  const { cleanupExpired } = await import("../lib/cleanup.ts");
  // D1 바인딩 대신 wrangler로 로컬 D1에 보낸다. 변경 수는 알 수 없어서 결과 행으로 확인한다.
  const db = {
    prepare: (sql) => ({ sql }),
    batch: async (statements) => statements.map(({ sql }) => (d1(sql), { meta: { changes: 0 } })),
  };
  await cleanupExpired(db);
  const owners = rows(`SELECT id FROM "PasskeyOwner" WHERE id IN ('own_e2e_orphan','own_e2e_kept')`).map((r) => r.id);
  check("cleanup removes owner without any User (cascade passkeys)", !owners.includes("own_e2e_orphan") && rows(`SELECT count(*) c FROM "Passkey" WHERE id='cred_e2e_orphan'`)[0].c === 0);
  check("cleanup keeps owner whose email still has a User", owners.includes("own_e2e_kept") && rows(`SELECT count(*) c FROM "Passkey" WHERE id='cred_e2e_kept'`)[0].c === 1);
  d1(`DELETE FROM "PasskeyOwner" WHERE id = 'own_e2e_kept'; DELETE FROM "User" WHERE id = 'usr_e2e_kept';`);
}

reset();
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
