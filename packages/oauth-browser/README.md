# @seogaemo/oauth-browser

SPA(React, Vue, Svelte 등)에서 Seogaemo로 로그인한다. [`@seogaemo/oauth`](../oauth) 위에 만들었다.

- public client + Authorization Code + PKCE (OAuth 2.0 for Browser-Based Apps)
- 로그인 상태를 저장하고, access token이 곧 만료되면 refresh token으로 갱신한다
- 여러 탭이 동시에 갱신하지 않게 Web Locks로 한 번에 한 탭만 갱신한다. 서버는 refresh token을 회전시키고 재사용을 감지해서, 같은 토큰으로 두 번 갱신하면 그 로그인을 끊는다
- 다른 탭의 로그인, 로그아웃을 `onChange`로 알려 준다

## 준비

콘솔에서 앱 종류를 "SPA, 모바일 앱"으로 만들고 등록한다.

- Redirect URI: `https://app.example.com/callback` (아래 `redirectUri`)
- 로그아웃 후 이동 주소: `https://app.example.com` (아래 `postLogoutRedirectUri`)

## 쓰기

```ts
import { createBrowserClient } from "@seogaemo/oauth-browser";

export const auth = await createBrowserClient({
  clientId: "콘솔의 Client ID",
  redirectUri: `${location.origin}/callback`,
  postLogoutRedirectUri: location.origin,
});

// 로그인 버튼
await auth.login({ returnTo: location.pathname });

// /callback 페이지
const { returnTo } = await auth.handleCallback();
location.replace(returnTo ?? "/");

// 어디서든
auth.getUser(); // { sub, email, name, ... } | null
const token = await auth.getAccessToken(); // 만료 전이면 그대로, 곧 만료면 갱신, 로그인이 끊겼으면 null
await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });

// 로그아웃: refresh token 폐기 + Seogaemo 로그아웃 + postLogoutRedirectUri로 돌아온다
await auth.logout();

// 로그인 상태가 바뀌면 (다른 탭 포함)
const stop = auth.onChange((user) => render(user));
```

옵션:

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `storage` | `localStorage` | 탭을 닫으면 끝나게 하려면 `sessionStorage` |
| `scope` | `openid email profile` | |
| `refreshLeewaySec` | `60` | 만료 몇 초 전부터 갱신할지 |
| `issuer` | `https://auth.seogaemo.com` | |

## 보안 메모

refresh token이 브라우저 저장소에 있으므로 XSS가 있으면 빼앗길 수 있다. 서버가 회전과 재사용 감지로 피해를 줄이지만, 서버가 있는 앱이라면 [`@seogaemo/oauth-next`](../oauth-next)처럼 서버(httpOnly 쿠키)에 두는 쪽이 더 안전하다.
