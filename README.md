# auth.seogaemo.com

Seogaemo SSO. 누구나 가입해서 자기 서비스를 등록하고 "Seogaemo로 로그인"을 붙일 수 있는 OAuth 2.0 / OpenID Connect 서버.

- Next.js 15 (App Router) + OpenNext on Cloudflare Workers
- D1 (Prisma, driver adapter), R2 (서비스 로고)
- 디자인 규칙은 [DESIGN.md](./DESIGN.md)

## 서비스에 붙이기

표준 OIDC라서 Auth.js, `oidc-client-ts` 같은 기존 라이브러리에 discovery 주소만 넣으면 된다.

```
https://auth.seogaemo.com/.well-known/openid-configuration
```

| 항목 | 값 |
|---|---|
| 흐름 | Authorization Code + PKCE (S256 필수) |
| scope | `openid`, `email`, `profile` |
| 클라이언트 인증 | `client_secret_basic`, `client_secret_post`, public client는 `none` |
| 토큰 | access token, id token 모두 ES256 JWT (1시간). refresh token은 30일, 쓸 때마다 교체 |
| 로그아웃 | `POST /oauth/revoke`로 refresh token 폐기 |

refresh token을 재사용하면 (이미 교체된 토큰이 다시 들어오면) 그 사용자의 토큰을 전부 끊는다.

## 로컬 개발

```bash
pnpm install
pnpm db:migrate:local
pnpm db:seed:local        # 테스트 서비스: dev-client / dev-secret, redirect http://localhost:5173/callback
pnpm preview              # 빌드 후 http://localhost:8787
```

`.dev.vars`에 로컬 값을 둔다 (git에 안 올라감).

```
ISSUER=http://localhost:8787
JWT_PRIVATE_JWK=...       # node scripts/generate-jwk.mjs
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
KAKAO_CLIENT_ID=          # 카카오 REST API 키
KAKAO_CLIENT_SECRET=      # 카카오에서 Client Secret을 켰을 때만
```

외부 제공자 콜백 주소는 `{ISSUER}/oauth/provider/{google|kakao}/callback`이다. Google Cloud Console, Kakao Developers에 등록한다.

전체 흐름 테스트: 위처럼 띄운 뒤 `node scripts/e2e-local.mjs` (스크립트 상단 주석 참고).

## DB 마이그레이션

`prisma/schema.prisma`를 고친 뒤:

```bash
npx wrangler d1 migrations create db.auth.seogaemo.com <이름>   # 빈 0002_<이름>.sql 생성
pnpm db:diff > migrations/0002_<이름>.sql                       # 로컬 DB와 스키마 차이를 SQL로
pnpm db:migrate:local
```

원격 적용은 main에 push하면 CI가 배포 전에 한다.

## 배포

main에 push하면 GitHub Actions가 D1 마이그레이션, 빌드, 배포를 한다. 처음 한 번은 시크릿을 넣어야 한다.

```bash
node scripts/generate-jwk.mjs | npx wrangler secret put JWT_PRIVATE_JWK
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put KAKAO_CLIENT_SECRET     # 쓰는 경우만
```

`GOOGLE_CLIENT_ID`, `KAKAO_CLIENT_ID`는 비밀값이 아니라서 `wrangler.jsonc`의 `vars`에 넣는다.
