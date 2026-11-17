# @seogaemo/oauth-next

Next.js(App Router, 14 이상)에 Seogaemo 로그인을 붙인다. [`@seogaemo/oauth`](../oauth) 위에 만들었다.

- 로그인, 콜백, 로그아웃 Route Handler
- 로그인 상태는 AES-GCM으로 암호화한 httpOnly 쿠키 하나 (DB 필요 없음)
- 서버 컴포넌트에서 `getUser()`, Route Handler와 Server Action에서 `getAccessToken()` (자동 갱신)
- 로그아웃은 같은 사이트의 POST만 받는다 (링크 미리 불러오기, 다른 사이트의 폼으로 로그아웃되지 않게)

## 준비

콘솔에 등록한다 (`baseUrl`이 `https://app.example.com`일 때).

- Redirect URI: `https://app.example.com/auth/callback`
- 로그아웃 후 이동 주소: `https://app.example.com`

환경 변수:

```bash
SEOGAEMO_CLIENT_ID=...
SEOGAEMO_CLIENT_SECRET=...      # 서버가 있는 웹앱으로 만들었을 때
SEOGAEMO_SESSION_SECRET=...     # openssl rand -base64 32
APP_URL=https://app.example.com
```

## 쓰기

```ts
// lib/auth.ts
import { createSeogaemoAuth } from "@seogaemo/oauth-next";

export const auth = createSeogaemoAuth({
  clientId: process.env.SEOGAEMO_CLIENT_ID!,
  clientSecret: process.env.SEOGAEMO_CLIENT_SECRET,
  baseUrl: process.env.APP_URL!,
  secret: process.env.SEOGAEMO_SESSION_SECRET!,
});
```

```ts
// app/auth/[action]/route.ts  ->  /auth/login, /auth/callback, /auth/logout
import { auth } from "@/lib/auth";
export const { GET, POST } = auth.handlers;
```

```tsx
// 서버 컴포넌트
const user = await auth.getUser(); // { sub, email, name, ... } | null

// 로그인 링크 (returnTo는 이 앱 안의 경로만)
<a href="/auth/login?returnTo=/dashboard">로그인</a>

// 로그아웃은 폼 POST
<form action="/auth/logout" method="post"><button>로그아웃</button></form>
```

```ts
// Route Handler, Server Action: API를 부를 때
const token = await auth.getAccessToken(); // 곧 만료면 갱신하고 쿠키도 바꾼다. 로그인이 끊겼으면 null
```

### 서버 컴포넌트에서 access token이 필요하면

서버 컴포넌트는 쿠키를 바꿀 수 없어서 갱신한 토큰을 저장하지 못한다. 저장하지 못한 채 갱신하면 다음 요청이 옛 refresh token을 다시 써서 서버가 로그인을 끊는다. 그래서 서버 컴포넌트에서 만료된 토큰을 갱신하려 하면 `RefreshNotPossibleHere`를 던진다 (서버에 묻기 전에). 미들웨어를 쓰면 렌더링 전에 갱신해 둔다:

```ts
// middleware.ts
import { auth } from "@/lib/auth";
export default auth.middleware;
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

미리 불러오기(prefetch) 요청에서는 갱신하지 않는다.

옵션:

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `basePath` | `/auth` | 핸들러를 붙인 경로 |
| `afterLoginPath` | `/` | returnTo가 없을 때. 로그인이 실패하면 `?auth_error={code}`를 붙여 보낸다 (`onError`로 바꿀 수 있다) |
| `afterLogoutPath` | `/` | `null`이면 Seogaemo 로그아웃 화면에 머문다 |
| `cookieName` | `seogaemo_session` | |
| `scope` | `openid email profile` | |
| `issuer` | `https://auth.seogaemo.com` | |

Next.js가 아닌 서버에는 `@seogaemo/oauth-next/core`의 `createCore`를 쓴다 (표준 `Request`, `Response`만 쓴다).
