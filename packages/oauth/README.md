# @seogaemo/oauth

Seogaemo SSO(`https://auth.seogaemo.com`)에 붙는 표준 OAuth 2.0 / OpenID Connect 클라이언트.

- 의존성 없음. `fetch`와 WebCrypto만 쓴다 (브라우저, Node 20+, Cloudflare Workers, Deno, Bun)
- Authorization Code + PKCE(S256)만 쓴다. implicit, password grant는 없다
- 콜백의 `state`와 `iss`(RFC 9207), ID 토큰의 서명, `iss`, `aud`, `azp`, `exp`, `iat`, `nonce`, `auth_time`을 확인한다

## 흐름

```ts
import { createClient } from "@seogaemo/oauth";

const client = await createClient({
  clientId: "콘솔의 Client ID",
  clientSecret: process.env.SEOGAEMO_CLIENT_SECRET, // 서버에서만. public client(앱, SPA)는 빼고
  redirectUri: "https://app.example.com/auth/callback",
});

// 1. 로그인 시작: url로 보내고 transaction은 저장해 둔다
const { url, transaction } = await client.startLogin();
// 서버 세션, 암호화 쿠키, sessionStorage, Keychain 등 (codeVerifier가 들어 있다)

// 2. redirectUri로 돌아오면
const { tokens, claims } = await client.finishLogin(request.url, transaction);
claims.sub; // 사용자 ID (서비스마다 다르다)
claims.email;

// 3. access token이 만료되면. 응답의 새 refresh_token을 저장한다 (회전)
const next = await client.refresh(tokens.refresh_token!);

// 4. 로그아웃: refresh token을 폐기하고 브라우저를 Seogaemo 로그아웃으로 보낸다
await client.revoke(next.tokens.refresh_token!, "refresh_token");
const logoutUrl = client.logoutUrl({ idTokenHint: tokens.id_token, postLogoutRedirectUri: "https://app.example.com/" });
```

`startLogin`의 옵션: `prompt`(`none`, `login`, `select_account`, `consent`), `maxAge`, `loginHint`, `scope`, `extraParams`.

## 오류

| 클래스 | 뜻 | 할 일 |
|---|---|---|
| `OAuthError` | 서버가 표준 오류를 돌려줬다. `error`(`invalid_grant`, `login_required`, `access_denied` 등), `description`, `status` | `error`로 분기한다. `invalid_grant`면 다시 로그인 |
| `ValidationError` | 응답이 표준 검사를 통과하지 못했다. `code`(`state_mismatch`, `issuer_mismatch`, `invalid_id_token` 등) | 공격일 수 있다. 재시도하지 말고 로그인을 처음부터 |

## 낮은 수준 함수

흐름을 직접 짜야 하면 `createClient` 대신 쓴다: `discover`, `createPkce`, `buildAuthorizationUrl`, `parseCallback`, `exchangeCode`, `refreshTokens`, `revokeToken`, `RemoteJwks`, `verifyIdToken`, `fetchUserInfo`, `buildLogoutUrl`, `randomString`.

모든 네트워크 함수는 `{ fetch }` 옵션을 받는다. 테스트나 프록시에 쓴다.

## 개발

```bash
pnpm --filter @seogaemo/oauth test     # 단위 테스트 (가짜 서버, 실제 ES256 서명)
pnpm --filter @seogaemo/oauth build
# 실제 서버에 붙여 보기: apps/auth를 로컬로 띄운 뒤
cd apps/auth && node scripts/e2e-sdk-local.mjs
```
