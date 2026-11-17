# auth.seogaemo.com

Seogaemo SSO. 누구나 가입해서 자기 서비스를 등록하고 "Seogaemo로 로그인"을 붙일 수 있는 OAuth 2.0 / OpenID Connect 서버.

- Next.js 15 (App Router) + OpenNext on Cloudflare Workers
- D1 (Prisma, driver adapter), R2 (서비스 로고)
- 디자인 규칙은 [DESIGN.md](./DESIGN.md)

## 콘솔

`/console`. 누구나 Seogaemo 계정(Google, 카카오)으로 로그인해서 자기 서비스를 등록한다.

- 콘솔도 이 SSO의 서비스 하나다 (`migrations/0002_console_service.sql`, client ID `seogaemo-console`). 개발자는 그 서비스의 사용자다
- Application 추가: Client ID 발급. 서버가 있는 웹앱이면 Client Secret도 발급 (만들 때 한 번만 보여줌, 설정에서 재발급)
- 설정: 이름, Redirect URI(https, 로컬만 http), 인증 방식, 서비스 삭제(소유자만)
- Branding: 로고(R2), 브랜드 색, 배경 색, 로그인 화면 미리보기
- User Management: 서비스 사용자 목록, 삭제
- Admins: 소유자 말고 같이 관리할 개발자를 콘솔 계정 이메일로 추가 (최대 20명, 가입 전 이메일도 가능, 알림 메일). 관리자는 설정, 브랜딩, 사용자 관리를 하고, 서비스 삭제와 관리자 추가는 소유자만 한다. 관리자는 스스로 나갈 수 있다

## 로그인 방식

서비스마다 콘솔에서 켜고 끈다.

| 방식 | 설명 |
|---|---|
| 이메일/비밀번호 | 회원가입은 메일로 받은 6자리 코드로 이메일을 확인한 뒤 끝난다. 비밀번호 재설정도 코드로 한다. 비밀번호는 PBKDF2-SHA256(10만 번)으로 저장하고, 5번 연속 틀리면 15분 잠근다. |
| 이메일 코드 | 비밀번호 없이 메일로 받은 6자리 코드로 로그인한다. 처음이면 바로 가입된다. |
| Google, 카카오 | OAuth |

- 인증 코드는 10분 동안 5번까지 입력할 수 있고, 같은 이메일로는 30초에 한 번, 한 시간에 5번까지 보낸다.
- 확인된 이메일이 같으면 로그인 방식이 달라도 같은 사용자로 합친다.
- 메일은 smtp2go SMTP로 보낸다 (`lib/smtp.ts`, Workers TCP 소켓). `SMTP_*`, `MAIL_FROM`이 비어 있으면 이메일 계열 로그인은 꺼진다.

### 로그인 수단 추가하기

외부 OAuth 제공자(예: 네이버, GitHub, Apple)를 붙이는 순서. DB 마이그레이션과 새 경로는 필요 없다.

1. `lib/provider-meta.ts`의 `PROVIDER_META`에 항목을 넣는다. 이름, 콘솔 아이콘 이름, 로그인 버튼 이름, 로고, 배경 클래스. 키 순서가 화면 순서다.
2. 아이콘을 넣는다. 콘솔 상태 아이콘 `public/icons/{icon}-on.svg`, `{icon}-off.svg`, 로그인 버튼 로고(`social.logo`).
3. `lib/oauth/providers.ts`에 `ProviderDefinition`을 만들고 `definitions`에 넣는다. 빠뜨리면 타입 검사가 실패한다.
   - `credentials(env)`: 키가 없으면 `null`. 그 수단은 화면과 콘솔에서 "준비 중"이 된다.
   - `exchangeCode`: `{ accessToken, idToken }`을 돌려준다. 공통 `postForm`이 `id_token`도 받아 둔다.
   - `fetchProfile(tokens, credentials)`: `emailVerified`는 제공자가 확인했다고 할 때만 `true`. 이 값이 `true`일 때만 이메일로 기존 사용자와 합친다.
4. 키를 등록한다. 공개 값은 `wrangler.jsonc`의 `vars`, secret은 `wrangler secret put`, 타입은 `cloudflare-env.d.ts`(`{PROVIDER}_CLIENT_ID` 이름 규칙), 로컬은 `.dev.vars`.
5. 제공자 콘솔에 콜백 주소 `https://auth.seogaemo.com/oauth/provider/{provider}/callback`을 등록한다.
6. `pnpm check:providers`로 아이콘, 로고, 키 타입이 다 있는지 확인한다. CI도 배포 전에 돌린다.

제공자별 주의:

- **Apple**: 결과를 `response_mode=form_post`로 보낸다. 콜백의 `POST`가 받아서 GET으로 다시 보내 주니 따로 할 일은 없다. client secret은 매번 서명하는 JWT라서 팀 ID, 키 ID, 개인 키를 `credentials.extra`에 넣고 `exchangeCode` 안에서 만든다. 사용자 정보는 `tokens.idToken`에만 있으니 Apple JWKS로 서명을 확인한 뒤 읽는다. 이름은 첫 로그인 POST의 `user` 값에만 오고, GET으로 옮길 때 쿼리 `user`로 남는다. 쓰려면 콜백에서 `completeProviderLogin`으로 넘겨 준다.
- **GitHub**: 이메일이 비공개면 프로필에 없어서 `fetchProfile`에서 `/user/emails`를 한 번 더 불러 `primary`, `verified`인 것을 쓴다.

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
SMTP_PASSWORD=            # smtp2go
MAIL_DEV_LOG=1            # 메일을 보내지 않고 로그(제목에 코드 포함)로 남긴다. localhost에서만 동작
```

외부 제공자 콜백 주소는 `{ISSUER}/oauth/provider/{google|kakao}/callback`이다. Google Cloud Console, Kakao Developers에 등록한다.

로컬에서 콘솔에 로그인하려면 위 키를 채우고, 각 제공자 콘솔에 `http://localhost:8787/oauth/provider/{google|kakao}/callback`도 등록해야 한다.

전체 흐름 테스트: 위처럼 띄운 뒤 `node scripts/e2e-local.mjs` (스크립트 상단 주석 참고).

## DB 마이그레이션

`prisma/schema.prisma`를 고친 뒤:

```bash
npx wrangler d1 migrations create db.auth.seogaemo.com <이름>   # 빈 0004_<이름>.sql 생성
pnpm db:diff > migrations/0004_<이름>.sql                       # 로컬 DB와 스키마 차이를 SQL로
pnpm db:migrate:local
```

원격 적용은 main에 push하면 CI가 배포 전에 한다.

## 배포

main에 push하면 GitHub Actions가 D1 마이그레이션, 빌드, 배포를 한다. 처음 한 번은 시크릿을 넣어야 한다.

```bash
node scripts/generate-jwk.mjs | npx wrangler secret put JWT_PRIVATE_JWK
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put KAKAO_CLIENT_SECRET     # 쓰는 경우만
npx wrangler secret put SMTP_PASSWORD
```

`GOOGLE_CLIENT_ID`, `KAKAO_CLIENT_ID`는 비밀값이 아니라서 `wrangler.jsonc`의 `vars`에 넣는다.
