# auth.seogaemo.com

Seogaemo SSO 서버와 SDK를 담은 pnpm workspace.

| 경로 | 패키지 | 내용 |
|---|---|---|
| [`apps/auth`](./apps/auth) | `@seogaemo/auth` (비공개) | SSO 서버와 콘솔. Next.js + OpenNext on Cloudflare Workers. 운영, 배포, 로컬 개발은 [apps/auth/README.md](./apps/auth/README.md) |
| [`packages/oauth`](./packages/oauth) | `@seogaemo/oauth` | 표준 OAuth 2.0 / OpenID Connect 클라이언트. 의존성 없음 (fetch, WebCrypto) |
| [`packages/oauth-browser`](./packages/oauth-browser) | `@seogaemo/oauth-browser` | SPA용. 로그인 이동, 토큰 저장, 탭 사이 안전한 갱신 |
| [`packages/oauth-next`](./packages/oauth-next) | `@seogaemo/oauth-next` | Next.js(App Router)용. Route Handler, 암호화 세션 쿠키, 갱신 |

```bash
pnpm install       # 전체 설치
pnpm test          # SDK 테스트
pnpm build         # SDK 빌드 (dist/)
pnpm typecheck     # 서버와 SDK 타입 검사
pnpm dev           # 서버 개발 모드 (apps/auth)
```

main에 push하면 CI가 SDK 테스트를 돌린 뒤 서버를 배포한다 (`.github/workflows/cicd.yml`). SDK는 아직 npm에 올리지 않는다.

## SDK가 따르는 표준

서버가 지원하는 것만 구현한다. 서버에 없는 기능을 SDK에서 흉내 내지 않는다.

| 표준 | SDK |
|---|---|
| RFC 6749 OAuth 2.0 (authorization code, refresh token, 클라이언트 인증 basic/post/none) | `exchangeCode`, `refreshTokens` |
| RFC 7636 PKCE (S256만) | `createPkce` |
| RFC 9207 인가 응답의 `iss` | `parseCallback` |
| RFC 7009 토큰 폐기 | `revokeToken` |
| RFC 6750 Bearer 토큰 | `fetchUserInfo` |
| OpenID Connect Core 1.0 (ID 토큰 검증, nonce, max_age, UserInfo) | `verifyIdToken`, `fetchUserInfo` |
| OpenID Connect Discovery 1.0 | `discover` |
| OpenID Connect RP-Initiated Logout 1.0 | `buildLogoutUrl` |
