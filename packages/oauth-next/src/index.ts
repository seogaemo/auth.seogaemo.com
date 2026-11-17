/**
 * @seogaemo/oauth-next: Next.js(App Router)에 Seogaemo 로그인을 붙인다.
 *
 *   // lib/auth.ts
 *   export const auth = createSeogaemoAuth({ clientId, clientSecret, baseUrl, secret });
 *   // app/auth/[action]/route.ts
 *   export const { GET, POST } = auth.handlers;
 *   // 서버 컴포넌트
 *   const user = await auth.getUser();
 *
 * 로그인 상태는 암호화한 httpOnly 쿠키 하나에 둔다 (DB 필요 없음).
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createCore, type SeogaemoAuthOptions, type SessionData } from "./core.js";

export type { SeogaemoAuthOptions, SessionData } from "./core.js";
export { OAuthError, ValidationError, type IdTokenClaims } from "@seogaemo/oauth";

/** 서버 컴포넌트에서 만료된 access token을 갱신하려 했을 때. 쿠키를 쓸 수 없는 곳이라 갱신 결과를 저장할 수 없다 */
export class RefreshNotPossibleHere extends Error {
  override readonly name = "RefreshNotPossibleHere";
  constructor() {
    super(
      "The access token expired and cannot be refreshed in a Server Component (cookies are read-only there). " +
        "Call getAccessToken() from a Route Handler or Server Action, or add auth.middleware to refresh before rendering.",
    );
  }
}

export function createSeogaemoAuth(options: SeogaemoAuthOptions) {
  const core = createCore(options);

  async function currentSession() {
    const store = await cookies();
    return { store, session: await core.readSession(store.get(core.cookieName)?.value) };
  }

  return {
    /** app/{basePath}/[action]/route.ts 에서 export const { GET, POST } = auth.handlers */
    handlers: core.handlers,

    /** 로그인한 사용자 (ID 토큰 클레임). 네트워크를 쓰지 않는다. 서버 컴포넌트, Route Handler, Server Action 어디서든 */
    async getUser() {
      return (await currentSession()).session?.user ?? null;
    },

    /** 쿠키의 세션 전체 (refresh token은 빼고) */
    async getSession(): Promise<Omit<SessionData, "refreshToken"> | null> {
      const { session } = await currentSession();
      if (!session) return null;
      const { refreshToken: _hidden, ...rest } = session;
      return rest;
    },

    /**
     * API에 붙일 access token. 곧 만료되면 갱신하고 쿠키도 바꾼다.
     * 서버 컴포넌트에서는 쿠키를 바꿀 수 없어서, 만료됐으면 RefreshNotPossibleHere를 던진다
     * (갱신한 토큰을 저장하지 못하면 다음 요청이 옛 refresh token을 다시 써서 서버가 로그인을 끊는다).
     * 로그인이 끊겼으면 null.
     */
    async getAccessToken(): Promise<string | null> {
      const { store, session } = await currentSession();
      if (!session) return null;
      if (!core.needsRefresh(session)) return session.accessToken;

      // 갱신은 refresh token을 회전시킨다. 결과를 쿠키에 못 쓰면 옛 토큰이 남아 다음 요청에서 로그인이 끊기므로,
      // 서버에 묻기 전에 쓸 수 있는 곳인지 확인한다 (서버 컴포넌트에서는 set이 예외를 던진다)
      const current = store.get(core.cookieName)!;
      try {
        store.set(core.cookieName, current.value, core.cookieOptions);
      } catch {
        throw new RefreshNotPossibleHere();
      }
      const refreshed = await core.refreshIfNeeded(session);
      if (refreshed.cookie) store.set(refreshed.cookie.name, refreshed.cookie.value, refreshed.cookie.options);
      return refreshed.session?.accessToken ?? null;
    },

    /**
     * middleware.ts 에서 쓰면 렌더링 전에 토큰을 갱신한다 (서버 컴포넌트가 늘 살아 있는 토큰을 본다).
     *   export default auth.middleware;
     *   export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
     * 미리 불러오기(prefetch) 요청에서는 갱신하지 않는다. 같은 refresh token으로 동시에 갱신하면 서버가 재사용으로 보고 끊기 때문이다.
     */
    async middleware(request: NextRequest) {
      const isPrefetch = request.headers.get("next-router-prefetch") === "1" || request.headers.get("purpose") === "prefetch";
      const value = request.cookies.get(core.cookieName)?.value;
      const isAuthRoute = ["login", "callback", "logout"].some((action) => request.nextUrl.pathname === `${core.basePath}/${action}`);
      if (isPrefetch || !value || isAuthRoute) return NextResponse.next();

      const session = await core.readSession(value);
      if (!session) return NextResponse.next();
      const refreshed = await core.refreshIfNeeded(session).catch(() => null);
      if (!refreshed?.cookie) return NextResponse.next();

      // 이번 요청의 렌더링도 새 쿠키를 보게 요청 헤더를 바꾸고, 브라우저에는 Set-Cookie로 저장한다
      request.cookies.set(refreshed.cookie.name, refreshed.cookie.value);
      const response = NextResponse.next({ request: { headers: request.headers } });
      response.cookies.set(refreshed.cookie.name, refreshed.cookie.value, refreshed.cookie.options);
      return response;
    },
  };
}
