# auth.seogaemo.com

Seogaemo SSO. 누구나 가입해서 자기 서비스를 등록하고 "Seogaemo로 로그인"을 붙일 수 있는 OAuth 2.0 / OpenID Connect 서버.

- Next.js 15 (App Router) + OpenNext on Cloudflare Workers
- D1 (Prisma, driver adapter), R2 (서비스 로고)
- 디자인 규칙은 [DESIGN.md](./DESIGN.md)

## 콘솔

`/console`. 누구나 Seogaemo 계정(Google, 카카오)으로 로그인해서 자기 서비스를 등록한다.

- 콘솔도 이 SSO의 서비스 하나다 (`migrations/0002_console_service.sql`, client ID `seogaemo-console`). 개발자는 그 서비스의 사용자다
- 앱 추가: Client ID 발급. 서버가 있는 웹앱이면 Client Secret도 발급 (만들 때 한 번만 보여줌, 설정에서 재발급)
- 설정: 이름, Redirect URI(https, 로컬만 http), 인증 방식, 서비스 삭제(소유자만)
- 브랜딩: 로고(R2), 브랜드 색, 배경 색, 로그인 화면 미리보기
- 가입과 약관: 새 가입 받기 켜고 끄기, 로그인 화면에 걸 이용약관과 개인정보 처리방침 주소
- 사용자 관리: 이메일, 이름, ID로 찾기. 상세에서 로그인 수단, 로그인된 기기, 최근 로그인 기록을 보고 정지, 모든 기기 로그아웃, 삭제
- 접근 제한: 켜면 허용 목록의 이메일, 도메인만 로그인과 가입을 할 수 있다 (`lib/allowlist.ts`). 확인된 이메일로만 맞추고, 목록 밖 사용자는 refresh token 갱신도 막는다
- 통계: 최근 14일 하루 로그인 수, 가입, 실패, 7일/30일 활성 사용자
- 활동 기록: 콘솔에서 누가 언제 무엇을 바꿨는지 (설정, 브랜딩, secret 재발급, 관리자, 사용자 정지와 삭제)
- 연동 가이드: Auth.js, oidc-client-ts 예제에 이 앱의 실제 값을 채워서 보여준다
- 관리자: 소유자 말고 같이 관리할 개발자를 콘솔 계정 이메일로 추가 (최대 20명, 가입 전 이메일도 가능, 알림 메일). 관리자는 설정, 브랜딩, 사용자 관리를 하고, 앱 삭제와 관리자 추가는 소유자만 한다. 관리자는 스스로 나갈 수 있다

## 로그인 방식

서비스마다 콘솔에서 켜고 끈다.

| 방식 | 설명 |
|---|---|
| 이메일/비밀번호 | 회원가입은 메일로 받은 6자리 코드로 이메일을 확인한 뒤 끝난다. 비밀번호 재설정도 코드로 한다. 비밀번호는 PBKDF2-SHA256(10만 번)으로 저장하고, 5번 연속 틀리면 15분 잠근다. |
| 이메일 코드 | 비밀번호 없이 메일로 받은 6자리 코드로 로그인한다. 처음이면 바로 가입된다. |
| 패스키 | 지문, 얼굴, 화면 잠금으로 로그인한다 (WebAuthn). 이메일/비밀번호나 이메일 코드가 켜진 서비스는 자동으로 같이 켜지고, 콘솔에서 따로 고르지 않는다. |
| Google, 카카오 | OAuth |

- 인증 코드는 10분 동안 5번까지 입력할 수 있고, 같은 이메일로는 30초에 한 번, 한 시간에 5번까지 보낸다.
- 확인된 이메일이 같으면 로그인 방식이 달라도 같은 사용자로 합친다.
- 정지된 사용자는 로그인, 토큰 발급과 갱신, userinfo가 모두 막힌다.

### 패스키

- **이메일 하나에 붙는다.** 사용자(`User`)는 서비스마다 따로지만 패스키(`Passkey`)는 이메일(`PasskeyOwner`)에 붙어서, 한 번 저장하면 모든 Seogaemo 서비스에서 쓸 수 있다. RP는 `ISSUER`의 호스트 하나 (`auth.seogaemo.com`, 로컬은 `localhost`)다. `PasskeyOwner.id`가 WebAuthn user.id이고, 이미 저장한 기기에는 `excludeCredentials`로 중복 저장을 막는다.
- **패스키로 로그인하면 그 이메일의 주인이 확인된 것**으로 본다 (이메일 코드와 같다). 그 서비스에 같은 이메일의 사용자가 있으면 그 사용자로 로그인하고, 없으면 이메일 코드가 켜진 서비스에서만 가입 설정(가입 받기, 허용 목록)을 따라 새로 만든다. 비밀번호만 켠 서비스에서는 거절한다. 연결은 `Identity(provider=passkey)`, 로그인 기록과 세션의 방식은 `passkey`다. 허용 목록, 정지된 사용자, IP별 시도 제한은 그대로 적용된다.
- **로그인 화면**: 이메일 칸이 `autocomplete="username webauthn"`이라서 칸을 누르면 저장한 패스키가 자동완성으로 뜬다 (Conditional UI). 고르면 바로 로그인한다. 버튼은 따로 없다.
- **저장 제안** (`/login/passkey`): 이메일 코드 로그인, 비밀번호 로그인, 비밀번호 회원가입 코드 확인 직후에 "저장하기 / 건너뛰기"를 보여준다. 비밀번호 재설정과 소셜 로그인 뒤에는 보여주지 않는다. 확인된 이메일이 없는 사용자는 묻지 않는다. 취소하거나 패스키를 못 쓰는 브라우저면 저장 없이 로그인을 마친다. 이 단계 동안 확인된 사용자는 `LoginTransaction.verifiedUserId`, `verifiedMethod`에 적어 두고, authorization code(5분)는 저장 제안이 끝난 뒤에 만든다.
- **관리**: `/account`에서 자기 이메일의 패스키를 보고 삭제한다 (모든 서비스에 적용). 콘솔 사용자 상세에는 목록만 보이고 삭제는 못 한다. 탈퇴해도 패스키는 지우지 않는다.
- **청소**: 매일 Cron이 어느 서비스에도 그 이메일의 사용자가 없는 `PasskeyOwner`(와 `Passkey`)를 지운다. 저장 도중 그만둬 패스키 없이 남은 소유자도 하루 뒤 지운다. WebAuthn challenge는 `LoginTransaction.webauthnChallenge`에 두고 한 번 쓰면 지운다.
- 라이브러리는 `@simplewebauthn/server`, `@simplewebauthn/browser`. 서버 코드는 `lib/passkey.ts`, 액션은 `actions/login.ts`(passkey*), 화면은 `components/login/PasskeyPrompt.tsx`.

### 로그인 유지와 로그아웃

- 로그인하면 그 브라우저에 앱별 로그인 세션이 30일 동안 남는다 (`Session`). 그동안 `/oauth/authorize`는 로그인 화면 없이 바로 code를 준다.
- 브라우저는 랜덤 쿠키 `sg_browser` 하나로 구분하고, DB에는 해시만 둔다. 세션 만료와 끊기는 DB 기준이다.
- id_token에 `sid`(세션 ID)와 `auth_time`이 들어간다.
- `prompt=none`: 화면 없이 확인만 한다. 세션이 없으면 `error=login_required`
- `prompt=login`, `max_age`: 다시 로그인시킨다
- `prompt=select_account`: "이 계정으로 계속 / 다른 계정으로 로그인" 화면
- `login_hint`: 이메일 칸을 미리 채운다
- 로그아웃: `GET/POST /oauth/logout` (OIDC RP-Initiated Logout). `id_token_hint`나 `client_id`로 앱을 알면 그 앱 세션만, 모르면 이 브라우저의 모든 세션을 끝낸다. 세션에서 나온 refresh token도 같이 끊긴다. `post_logout_redirect_uri`는 등록된 Redirect URI와 origin이 같을 때만 따르고, 아니면 우리 로그아웃 화면에 머문다.
- 콘솔 로그아웃도 콘솔 앱의 세션을 같이 끝낸다.

### 계정 화면

`/account?client_id=...`. 사용자가 직접 비밀번호를 바꾸거나 만들고, 패스키를 보고 삭제하고, 로그인된 기기를 보고 다른 기기를 로그아웃시키고, 탈퇴한다. 세션이 없으면 로그인부터 하고 돌아온다 (`LoginTransaction.returnTo`). 앱은 설정 메뉴에 이 주소를 링크로 걸면 된다.

### 가입 설정

- 가입을 끄면 처음 보는 이메일은 코드를 보내기 전에 막고, 소셜 로그인으로 처음 들어온 사람은 오류 화면으로 보낸다.
- 이메일, 도메인으로 누구를 받을지는 접근 제한(허용 목록)이 정한다. 허용 목록 밖이 되면 로그인 유지 세션도 더 이어지지 않는다.

### 보안

- 계정별: 비밀번호 5번 틀리면 15분 잠금, 코드 5번까지, 코드 요청 30초에 한 번, 한 시간 5번
- IP별: 로그인 단계 요청을 1분에 30번까지 (Workers Rate Limiting, `wrangler.jsonc`의 `LOGIN_LIMITER`)
- 사람 확인: `TURNSTILE_SITE_KEY`(vars)와 `TURNSTILE_SECRET_KEY`(secret)가 둘 다 있으면 이메일 입력, 가입, 비밀번호 재설정 화면에 Cloudflare Turnstile이 붙는다. 없으면 꺼진다
- 로그인, 가입, 실패는 `LoginEvent`에, 콘솔 변경은 `AuditLog`에 남는다
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
| 로그아웃 | `/oauth/logout` (end_session_endpoint). refresh token만 끊으려면 `POST /oauth/revoke` |
| 로그인 유지 | 30일. `prompt`(none, login, select_account), `max_age`, `login_hint` 지원 |
| 계정 화면 | `/account?client_id=...` |

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

전체 흐름 테스트: 위처럼 띄운 뒤 `node scripts/e2e-local.mjs` (스크립트 상단 주석 참고). 로그인 유지, prompt, 로그아웃, 정지, 계정 화면은 `node scripts/e2e-session-local.mjs`.

패스키는 진짜 Chrome과 가상 인증기(CDP)로 확인한다: `node scripts/e2e-passkey-local.mjs` (스크립트 상단 주석 참고). `ISSUER`가 `.dev.vars`와 같은 주소로 떠 있어야 하고(기본 `http://localhost:8788`, 다르면 `E2E_BASE`), WebAuthn은 `localhost`에서만 `http`로 동작한다.

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

### 데이터 청소

매일 03:17(KST)에 Cron이 `worker.ts`의 `scheduled`를 불러 `lib/cleanup.ts`를 돌린다.

- 만료되고 하루 지난 로그인 중간 기록, 인증 코드, 이메일 코드, 세션, refresh token을 지운다.
- 어느 서비스에도 사용자가 없는 이메일의 패스키 소유자(`PasskeyOwner`, 패스키는 cascade)를 지운다.
- 로그인 기록은 90일, 콘솔 활동 기록은 1년만 남긴다.

결과는 Workers 로그에 `cleanup {...}`로 남는다. 로컬에서는 `npx wrangler dev --test-scheduled`로 띄운 뒤 `curl "http://localhost:8787/__scheduled?cron=17+18+*+*+*"`로 돌려 본다.

### 서명 키 교체

토큰(1시간)과 콘솔 세션(7일)이 옛 키로 서명돼 있으니, 옛 공개키를 한동안 JWKS에 같이 둔다.

```bash
# 1. 지금 공개키를 "교체 전 키"로 등록
curl -s https://auth.seogaemo.com/.well-known/jwks.json | node -e 'process.stdin.on("data",d=>process.stdout.write(JSON.stringify(JSON.parse(d).keys)))' | npx wrangler secret put JWT_RETIRED_JWKS
# 2. 새 개인키로 바꾼다
node scripts/generate-jwk.mjs | npx wrangler secret put JWT_PRIVATE_JWK
# 3. 8일 뒤 (콘솔 세션 7일이 지나면) 옛 키를 뺀다
npx wrangler secret delete JWT_RETIRED_JWKS
```

이 동안 JWKS에는 키가 두 개 보이고, 새 토큰은 새 키로만 서명된다. 개인키가 새어 나간 경우라면 3번을 기다리지 말고 바로 지운다 (옛 토큰이 다 끊긴다).

### Turnstile

Cloudflare 대시보드 > Turnstile에서 `auth.seogaemo.com` 위젯(관리형)을 만들고:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

사이트 키는 비밀값이 아니라서 `wrangler.jsonc`의 `vars.TURNSTILE_SITE_KEY`에 넣는다.

### GitHub Actions 토큰

CI는 저장소 시크릿 `CLOUDFLARE_API_TOKEN` 하나를 쓴다. 계정은 워크플로에 Seogaemo 계정 ID로 고정돼 있다.

1. Cloudflare 대시보드 > 내 프로필 > API 토큰 > 토큰 생성 > 사용자 지정 토큰
2. 권한
   - 계정 / Workers 스크립트 / 편집
   - 계정 / D1 / 편집
   - 계정 / Workers R2 저장소 / 편집
   - 계정 / 계정 설정 / 읽기
   - 영역 / Workers 경로 / 편집
   - 영역 / DNS / 편집 (커스텀 도메인 `auth.seogaemo.com`)
3. 계정 리소스: Seogaemo 계정만. 영역 리소스: `seogaemo.com`만
4. 저장소에 넣는다 (값은 프롬프트로 입력돼서 셸 기록에 남지 않는다)

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo seogaemo/auth.seogaemo.com
```

`The given account is not valid or is not authorized` (7403)이 나오면 토큰이 다른 계정에서 만들어졌거나 D1 권한이 없는 것이다.
