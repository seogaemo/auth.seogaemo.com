/**
 * @seogaemo/oauth-browser: SPA에서 Seogaemo로 로그인한다.
 *
 * OAuth 2.0 for Browser-Based Apps (IETF BCP 초안)를 따른다:
 * public client + Authorization Code + PKCE, refresh token은 서버가 회전시키고 재사용을 감지한다.
 * 그래서 여러 탭이 같은 refresh token으로 동시에 갱신하면 안 된다. 갱신은 Web Locks로 한 번에 한 탭만 한다.
 */
import {
  createClient,
  OAuthError,
  type IdTokenClaims,
  type LoginOptions,
  type LoginTransaction,
  type OAuthClient,
  type ServerMetadata,
  type TokenResponse,
} from "@seogaemo/oauth";

export { OAuthError, ValidationError } from "@seogaemo/oauth";
export type { IdTokenClaims } from "@seogaemo/oauth";

/** 저장해 두는 로그인 상태 */
export interface StoredSession {
  accessToken: string;
  /** ms */
  expiresAt: number;
  refreshToken?: string;
  idToken?: string;
  claims: IdTokenClaims;
  scope?: string;
}

export interface BrowserClientOptions {
  clientId: string;
  /** 이 SPA에서 handleCallback()을 부르는 주소. 콘솔에 Redirect URI로 등록한다 */
  redirectUri: string;
  /** 로그아웃 뒤 돌아올 주소. 콘솔에 "로그아웃 후 이동 주소"로 등록한다. 없으면 Seogaemo 로그아웃 화면에 머문다 */
  postLogoutRedirectUri?: string;
  /** 기본 https://auth.seogaemo.com */
  issuer?: string;
  scope?: string;
  /**
   * 로그인 상태를 둘 곳. 기본 localStorage (탭을 닫아도 유지, 탭끼리 공유).
   * 탭을 닫으면 끝나게 하려면 sessionStorage.
   */
  storage?: Storage;
  /** 만료 몇 초 전부터 미리 갱신할지. 기본 60 */
  refreshLeewaySec?: number;
  /** 테스트용. 기본은 브라우저 전역 */
  env?: Partial<BrowserEnv>;
  metadata?: ServerMetadata;
}

/** 브라우저에 기대는 부분. 테스트에서 바꿔 끼운다 */
export interface BrowserEnv {
  fetch: typeof fetch;
  /** 로그인 진행 중 값(state, PKCE verifier)을 둘 곳. 이 탭에서만 필요해서 sessionStorage */
  transactionStorage: Storage;
  navigate(url: string): void;
  /** 콜백 처리 뒤 주소창에서 code, state를 지운다 */
  replaceUrl(url: string): void;
  currentUrl(): string;
  /** 탭 사이 잠금. 없으면(오래된 브라우저) 이 탭 안에서만 한 번에 하나 */
  locks?: LockManager;
  addStorageListener(listener: (event: StorageEvent) => void): () => void;
}

export interface BrowserClient {
  /** Seogaemo 로그인 화면으로 보낸다. returnTo는 로그인 뒤 돌아갈 이 앱 안의 경로 */
  login(options?: LoginOptions & { returnTo?: string }): Promise<void>;
  /** redirectUri 페이지에서 부른다. 로그인을 마치고 returnTo를 돌려준다 */
  handleCallback(url?: string): Promise<{ claims: IdTokenClaims; returnTo?: string }>;
  /** 저장된 사용자. 네트워크를 쓰지 않는다 */
  getUser(): IdTokenClaims | null;
  /** API에 붙일 access token. 곧 만료되면 갱신한다. 로그인이 끝났으면 null */
  getAccessToken(): Promise<string | null>;
  /** refresh token을 폐기하고 Seogaemo 로그아웃으로 보낸다 */
  logout(): Promise<void>;
  /** 이 탭이나 다른 탭에서 로그인 상태가 바뀌면 부른다. 반환값을 부르면 그만 듣는다 */
  onChange(listener: (user: IdTokenClaims | null) => void): () => void;
  readonly oauth: OAuthClient;
}

const TRANSACTION_TTL_MS = 10 * 60 * 1000;

/** 넘겨받지 않은 것만 브라우저 전역에서 채운다 (전역은 쓸 때 읽는다. SSR이나 테스트에서 import만 해도 터지지 않게) */
function resolveEnv(given: Partial<BrowserEnv> = {}): BrowserEnv {
  return {
    fetch: given.fetch ?? globalThis.fetch.bind(globalThis),
    transactionStorage: given.transactionStorage ?? sessionStorage,
    navigate: given.navigate ?? ((url) => window.location.assign(url)),
    replaceUrl: given.replaceUrl ?? ((url) => window.history.replaceState(window.history.state, "", url)),
    currentUrl: given.currentUrl ?? (() => window.location.href),
    locks: "locks" in given ? given.locks : typeof navigator !== "undefined" ? navigator.locks : undefined,
    addStorageListener:
      given.addStorageListener ??
      ((listener) => {
        window.addEventListener("storage", listener);
        return () => window.removeEventListener("storage", listener);
      }),
  };
}

/** 같은 앱 안의 경로만 (다른 사이트로 보내는 열린 리다이렉트 방지) */
function safeReturnTo(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : undefined;
}

function toSession(tokens: TokenResponse, claims: IdTokenClaims | undefined, previous?: StoredSession): StoredSession {
  const resolved = claims ?? previous?.claims;
  if (!resolved) throw new OAuthError("invalid_response", "login finished without an ID token; request the openid scope");
  return {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    // 갱신 응답에 refresh token이 없으면 이전 것을 계속 쓴다 (RFC 6749 6)
    refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    idToken: tokens.id_token ?? previous?.idToken,
    claims: resolved,
    scope: tokens.scope ?? previous?.scope,
  };
}

export async function createBrowserClient(options: BrowserClientOptions): Promise<BrowserClient> {
  const env = resolveEnv(options.env);
  const storage = options.storage ?? localStorage;
  const leewayMs = (options.refreshLeewaySec ?? 60) * 1000;
  const oauth = await createClient({
    clientId: options.clientId,
    redirectUri: options.redirectUri,
    issuer: options.issuer,
    scope: options.scope,
    metadata: options.metadata,
    fetch: env.fetch,
  });

  const sessionKey = `seogaemo.session.${options.clientId}`;
  const txPrefix = `seogaemo.tx.${options.clientId}.`;
  const listeners = new Set<(user: IdTokenClaims | null) => void>();

  const read = (): StoredSession | null => {
    try {
      const raw = storage.getItem(sessionKey);
      return raw ? (JSON.parse(raw) as StoredSession) : null;
    } catch {
      return null;
    }
  };
  const emit = () => {
    const user = read()?.claims ?? null;
    for (const listener of listeners) listener(user);
  };
  const write = (session: StoredSession | null) => {
    if (session) storage.setItem(sessionKey, JSON.stringify(session));
    else storage.removeItem(sessionKey);
    emit();
  };

  /** 오래된 로그인 진행 값은 지운다 (돌아오지 않은 로그인) */
  const sweepTransactions = () => {
    for (let i = env.transactionStorage.length - 1; i >= 0; i--) {
      const key = env.transactionStorage.key(i);
      if (!key?.startsWith(txPrefix)) continue;
      try {
        const tx = JSON.parse(env.transactionStorage.getItem(key) ?? "") as LoginTransaction;
        if (Date.now() - tx.createdAt > TRANSACTION_TTL_MS) env.transactionStorage.removeItem(key);
      } catch {
        env.transactionStorage.removeItem(key);
      }
    }
  };

  /** 한 번에 하나만. 다른 탭이 이미 갱신했으면 그 결과를 쓴다 */
  let inFlight: Promise<string | null> | null = null;
  const refreshLocked = async (): Promise<string | null> => {
    const run = async () => {
      // 잠금을 기다리는 동안 다른 탭이 갱신했을 수 있다
      const current = read();
      if (!current) return null;
      if (current.expiresAt - leewayMs > Date.now()) return current.accessToken;
      if (!current.refreshToken) {
        write(null);
        return null;
      }
      try {
        const { tokens, claims } = await oauth.refresh(current.refreshToken);
        const next = toSession(tokens, claims, current);
        write(next);
        return next.accessToken;
      } catch (error) {
        // 끊긴 로그인 (로그아웃, 정지, 만료). 다시 로그인해야 한다
        if (error instanceof OAuthError && error.error === "invalid_grant") {
          write(null);
          return null;
        }
        throw error;
      }
    };
    return env.locks ? env.locks.request(`seogaemo-refresh:${options.clientId}`, run) : run();
  };

  // 다른 탭의 로그인, 로그아웃, 갱신
  env.addStorageListener((event) => {
    if (event.key === sessionKey || event.key === null) emit();
  });

  return {
    oauth,

    async login(login = {}) {
      sweepTransactions();
      const { returnTo, ...rest } = login;
      const { url, transaction } = await oauth.startLogin(rest);
      env.transactionStorage.setItem(txPrefix + transaction.state, JSON.stringify({ ...transaction, returnTo: safeReturnTo(returnTo) }));
      env.navigate(url.toString());
    },

    async handleCallback(url = env.currentUrl()) {
      const callback = new URL(url);
      const state = callback.searchParams.get("state") ?? "";
      const key = txPrefix + state;
      const raw = env.transactionStorage.getItem(key);
      env.transactionStorage.removeItem(key);
      // 주소창의 code는 쓰든 못 쓰든 바로 지운다 (새로고침, 뒤로 가기로 다시 쓰이지 않게)
      const clean = new URL(callback);
      for (const param of ["code", "state", "iss", "error", "error_description", "session_state"]) clean.searchParams.delete(param);
      env.replaceUrl(clean.toString());

      if (!raw) throw new OAuthError("invalid_request", "no login in progress in this tab, or it expired; start the login again");
      const transaction = JSON.parse(raw) as LoginTransaction & { returnTo?: string };
      if (Date.now() - transaction.createdAt > TRANSACTION_TTL_MS) {
        throw new OAuthError("invalid_request", "the login took too long; start it again");
      }
      const { tokens, claims } = await oauth.finishLogin(callback, transaction);
      const session = toSession(tokens, claims);
      write(session);
      return { claims: session.claims, returnTo: transaction.returnTo };
    },

    getUser() {
      return read()?.claims ?? null;
    },

    async getAccessToken() {
      const session = read();
      if (!session) return null;
      if (session.expiresAt - leewayMs > Date.now()) return session.accessToken;
      inFlight ??= refreshLocked().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    async logout() {
      const session = read();
      write(null);
      if (session?.refreshToken) {
        // 폐기에 실패해도 로그아웃은 이어간다 (세션이 끝나면 서버가 그 refresh token도 끊는다)
        await oauth.revoke(session.refreshToken, "refresh_token").catch(() => {});
      }
      env.navigate(
        oauth.logoutUrl({ idTokenHint: session?.idToken, postLogoutRedirectUri: options.postLogoutRedirectUri }).toString(),
      );
    },

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
