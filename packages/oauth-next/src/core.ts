/**
 * Next.js에 기대지 않는 부분: Request를 받아 Response를 돌려주는 로그인, 콜백, 로그아웃과 세션 쿠키.
 * next/headers를 쓰는 함수는 index.ts에 있다. 여기만으로도 다른 프레임워크에 붙일 수 있다.
 */
import {
  createClient,
  OAuthError,
  ValidationError,
  type IdTokenClaims,
  type LoginTransaction,
  type OAuthClient,
  type ServerMetadata,
  type TokenResponse,
} from "@seogaemo/oauth";

import { seal, unseal } from "./seal.js";

export interface SeogaemoAuthOptions {
  clientId: string;
  /** 서버가 있는 앱이면 넣는다 (client_secret_basic). 없으면 public client로 PKCE만 쓴다 */
  clientSecret?: string;
  /** 이 앱의 바깥 주소 (https://app.example.com). redirect_uri를 만든다. 프록시 뒤에서도 정확하도록 직접 받는다 */
  baseUrl: string;
  /** 세션 쿠키 암호화 키. 32자 이상의 무작위 문자열 (openssl rand -base64 32) */
  secret: string;
  /** 기본 https://auth.seogaemo.com */
  issuer?: string;
  /** 기본 "openid email profile" */
  scope?: string;
  /** 핸들러를 붙인 경로. 기본 /auth (/auth/login, /auth/callback, /auth/logout) */
  basePath?: string;
  /** 로그인 뒤 returnTo가 없을 때 갈 곳. 기본 / */
  afterLoginPath?: string;
  /**
   * 로그아웃 뒤 돌아올 경로. 기본 /. baseUrl과 합친 주소를 콘솔의 "로그아웃 후 이동 주소"에 등록해야 돌아온다.
   * null이면 Seogaemo 로그아웃 화면에 머문다.
   */
  afterLogoutPath?: string | null;
  /** 기본 seogaemo_session */
  cookieName?: string;
  /** access token 만료 몇 초 전부터 갱신할지. 기본 60 */
  refreshLeewaySec?: number;
  /** 콜백에서 로그인이 실패했을 때. 기본은 afterLoginPath?auth_error={code}로 보낸다 */
  onError?: (error: unknown, request: Request) => Response | Promise<Response>;
  fetch?: typeof fetch;
  metadata?: ServerMetadata;
}

/** 쿠키에 암호화해 두는 로그인 상태 */
export interface SessionData {
  user: IdTokenClaims;
  accessToken: string;
  /** ms */
  expiresAt: number;
  refreshToken?: string;
  idToken?: string;
}

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: "lax"; path: string; maxAge: number };
}

const TRANSACTION_TTL_SEC = 10 * 60;
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
/** 브라우저 쿠키 한 개 한도는 4096바이트. 넘으면 브라우저가 조용히 버린다 */
const COOKIE_LIMIT = 4000;

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : null;
}

function readCookie(header: string | null, name: string) {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : undefined;
}

function serialize({ name, value, options }: CookieToSet) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    `SameSite=Lax`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export function createCore(options: SeogaemoAuthOptions) {
  if (options.secret.length < 32) throw new Error("@seogaemo/oauth-next: secret must be at least 32 characters");
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const basePath = (options.basePath ?? "/auth").replace(/\/$/, "");
  const afterLoginPath = options.afterLoginPath ?? "/";
  const afterLogoutPath = options.afterLogoutPath === undefined ? "/" : options.afterLogoutPath;
  const cookieName = options.cookieName ?? "seogaemo_session";
  const txCookieName = `${cookieName}_tx`;
  const secure = baseUrl.startsWith("https://");
  const leewayMs = (options.refreshLeewaySec ?? 60) * 1000;
  const redirectUri = `${baseUrl}${basePath}/callback`;
  /** 로그인 진행 쿠키는 핸들러 경로에만 보낸다 */
  const txPath = basePath || "/";

  let client: Promise<OAuthClient> | null = null;
  const oauth = () =>
    (client ??= createClient({
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      redirectUri,
      issuer: options.issuer,
      scope: options.scope,
      metadata: options.metadata,
      fetch: options.fetch,
    }).catch((error) => {
      client = null; // discovery 실패는 다음 요청에서 다시 시도한다
      throw error;
    }));

  const cookie = (name: string, value: string, maxAge: number, path = "/"): CookieToSet => ({
    name,
    value,
    options: { httpOnly: true, secure, sameSite: "lax", path, maxAge },
  });
  const clear = (name: string, path = "/") => cookie(name, "", 0, path);

  async function sessionCookie(session: SessionData) {
    const value = await seal(session, options.secret, "session");
    if (value.length > COOKIE_LIMIT) {
      throw new Error(`@seogaemo/oauth-next: session cookie is ${value.length} bytes, over the browser limit; request fewer scopes`);
    }
    return cookie(cookieName, value, SESSION_TTL_SEC);
  }

  function toSession(tokens: TokenResponse, user: IdTokenClaims | undefined, previous?: SessionData): SessionData {
    const resolved = user ?? previous?.user;
    if (!resolved) throw new ValidationError("invalid_response", "login finished without an ID token; keep the openid scope");
    return {
      user: resolved,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      refreshToken: tokens.refresh_token ?? previous?.refreshToken,
      idToken: tokens.id_token ?? previous?.idToken,
    };
  }

  const redirect = (location: string, cookies: CookieToSet[], status = 302) => {
    const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
    for (const c of cookies) headers.append("Set-Cookie", serialize(c));
    return new Response(null, { status, headers });
  };

  async function readSession(cookieValue: string | undefined) {
    return unseal<SessionData>(cookieValue, options.secret, "session");
  }

  /**
   * 곧 만료되면 갱신한 세션과 새 쿠키를 돌려준다.
   * 끊긴 로그인(invalid_grant)이면 session: null과 지우는 쿠키.
   */
  async function refreshIfNeeded(session: SessionData): Promise<{ session: SessionData | null; cookie?: CookieToSet }> {
    if (session.expiresAt - leewayMs > Date.now()) return { session };
    if (!session.refreshToken) return { session: null, cookie: clear(cookieName) };
    try {
      const { tokens, claims } = await (await oauth()).refresh(session.refreshToken);
      const next = toSession(tokens, claims, session);
      return { session: next, cookie: await sessionCookie(next) };
    } catch (error) {
      if (error instanceof OAuthError && error.error === "invalid_grant") return { session: null, cookie: clear(cookieName) };
      throw error;
    }
  }

  async function login(request: Request) {
    const url = new URL(request.url);
    const { url: authorizeUrl, transaction } = await (await oauth()).startLogin({
      prompt: url.searchParams.get("prompt") ?? undefined,
      loginHint: url.searchParams.get("login_hint") ?? undefined,
    });
    const returnTo = safeReturnTo(url.searchParams.get("returnTo")) ?? afterLoginPath;
    const tx = await seal({ ...transaction, returnTo }, options.secret, "transaction");
    return redirect(authorizeUrl.toString(), [cookie(txCookieName, tx, TRANSACTION_TTL_SEC, txPath)]);
  }

  async function callback(request: Request) {
    const search = new URL(request.url).search;
    const header = request.headers.get("cookie");
    const tx = await unseal<LoginTransaction & { returnTo: string }>(readCookie(header, txCookieName), options.secret, "transaction");
    const done = [clear(txCookieName, txPath)];
    try {
      if (!tx || Date.now() - tx.createdAt > TRANSACTION_TTL_SEC * 1000) {
        throw new OAuthError("invalid_request", "no login in progress or it expired; start the login again");
      }
      // 프록시 뒤에서 request.url의 호스트가 다를 수 있어 등록한 주소에 쿼리만 붙인다
      const { tokens, claims } = await (await oauth()).finishLogin(`${redirectUri}${search}`, tx);
      return redirect(`${baseUrl}${tx.returnTo}`, [...done, await sessionCookie(toSession(tokens, claims))]);
    } catch (error) {
      if (options.onError) {
        const response = await options.onError(error, request);
        const headers = new Headers(response.headers);
        for (const c of done) headers.append("Set-Cookie", serialize(c));
        return new Response(response.body, { status: response.status, headers });
      }
      const code = error instanceof OAuthError ? error.error : error instanceof ValidationError ? error.code : "server_error";
      return redirect(`${baseUrl}${afterLoginPath}${afterLoginPath.includes("?") ? "&" : "?"}auth_error=${encodeURIComponent(code)}`, done);
    }
  }

  async function logout(request: Request) {
    // 다른 사이트가 폼을 자동 제출해 로그아웃시키지 못하게 같은 origin에서 온 요청만 받는다
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if (origin ? origin !== new URL(baseUrl).origin : site !== null && site !== "same-origin") {
      return new Response("Cross-site logout refused", { status: 403 });
    }
    const session = await readSession(readCookie(request.headers.get("cookie"), cookieName));
    const client = await oauth();
    if (session?.refreshToken) await client.revoke(session.refreshToken, "refresh_token").catch(() => {});
    const target = client.logoutUrl({
      idTokenHint: session?.idToken,
      postLogoutRedirectUri: afterLogoutPath === null ? undefined : `${baseUrl}${afterLogoutPath}`,
    });
    // 폼 POST의 결과 이동은 303 (브라우저가 GET으로 따라간다)
    return redirect(target.toString(), [clear(cookieName)], 303);
  }

  /** app/auth/[action]/route.ts 의 GET, POST */
  const handlers = {
    async GET(request: Request) {
      const action = new URL(request.url).pathname.slice(basePath.length + 1);
      if (action === "login") return login(request);
      if (action === "callback") return callback(request);
      if (action === "logout") {
        // 링크 미리 불러오기, 다른 사이트의 이미지 태그로 로그아웃되지 않게 POST만 받는다
        return new Response("Use POST to log out", { status: 405, headers: { Allow: "POST" } });
      }
      return new Response("Not found", { status: 404 });
    },
    async POST(request: Request) {
      const action = new URL(request.url).pathname.slice(basePath.length + 1);
      if (action === "logout") return logout(request);
      return new Response("Not found", { status: 404, headers: { Allow: "GET" } });
    },
  };

  const needsRefresh = (session: SessionData) => session.expiresAt - leewayMs <= Date.now();
  const cookieOptions = cookie(cookieName, "", SESSION_TTL_SEC).options;

  return { handlers, readSession, refreshIfNeeded, needsRefresh, cookieName, cookieOptions, readCookie, serialize, basePath };
}
