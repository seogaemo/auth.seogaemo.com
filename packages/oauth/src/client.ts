import { buildAuthorizationUrl, parseCallback } from "./authorize.js";
import { randomString } from "./encoding.js";
import { ValidationError } from "./errors.js";
import { RemoteJwks, verifyIdToken, type IdTokenClaims } from "./jwt.js";
import { buildLogoutUrl, type LogoutRequest } from "./logout.js";
import { discover, SEOGAEMO_ISSUER, type FetchOptions, type ServerMetadata } from "./metadata.js";
import { createPkce } from "./pkce.js";
import { exchangeCode, refreshTokens, revokeToken, type ClientCredentials, type TokenResponse } from "./token.js";
import { fetchUserInfo, type UserInfo } from "./userinfo.js";

export interface ClientOptions extends ClientCredentials, FetchOptions {
  /** 기본 https://auth.seogaemo.com */
  issuer?: string;
  redirectUri: string;
  /** 기본 "openid email profile" */
  scope?: string;
  /** 이미 읽어 둔 메타데이터가 있으면 discovery를 건너뛴다 */
  metadata?: ServerMetadata;
}

/**
 * 로그인 한 번의 상태. startLogin이 만들고 finishLogin이 쓴다.
 * JSON으로 바꿀 수 있으니 서버 세션, 암호화 쿠키, sessionStorage, Keychain 중 맞는 곳에 둔다.
 * 다른 사람이 읽거나 바꿀 수 없는 곳이어야 한다 (codeVerifier가 들어 있다).
 */
export interface LoginTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  maxAge?: number;
  /** 만든 시각 (ms). 오래된 트랜잭션을 버릴 때 쓴다 */
  createdAt: number;
}

export interface LoginOptions {
  prompt?: "none" | "login" | "consent" | "select_account" | (string & {});
  maxAge?: number;
  loginHint?: string;
  /** 이 로그인만 다른 scope */
  scope?: string;
  extraParams?: Record<string, string>;
}

export interface LoginResult {
  tokens: TokenResponse;
  /** 검증을 마친 ID 토큰 클레임. scope에 openid가 없으면 없다 */
  claims?: IdTokenClaims;
}

export interface OAuthClient {
  readonly metadata: ServerMetadata;
  readonly clientId: string;
  /** authorize 주소와, 저장해 둘 트랜잭션 */
  startLogin(options?: LoginOptions): Promise<{ url: URL; transaction: LoginTransaction }>;
  /** 돌아온 주소를 검사하고 code를 토큰으로 바꾼 뒤 ID 토큰까지 검증한다 */
  finishLogin(callbackUrl: string | URL, transaction: LoginTransaction): Promise<LoginResult>;
  /** 새 refresh_token이 오면 그걸 저장한다 (회전) */
  refresh(refreshToken: string): Promise<LoginResult>;
  revoke(token: string, tokenTypeHint?: "refresh_token" | "access_token"): Promise<void>;
  userInfo(accessToken: string, expectedSub?: string): Promise<UserInfo>;
  logoutUrl(request?: LogoutRequest): URL;
}

/** discovery를 한 번 하고, 같은 설정으로 로그인 흐름 전체를 다루는 클라이언트를 만든다 */
export async function createClient(options: ClientOptions): Promise<OAuthClient> {
  const fetchOptions: FetchOptions = options.fetch ? { fetch: options.fetch } : {};
  const metadata = options.metadata ?? (await discover(options.issuer ?? SEOGAEMO_ISSUER, fetchOptions));
  const jwks = new RemoteJwks(metadata.jwks_uri, fetchOptions);
  const credentials: ClientCredentials = {
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    authMethod: options.authMethod,
  };
  const scope = options.scope ?? "openid email profile";

  async function verify(tokens: TokenResponse, nonce: string | undefined, maxAge: number | undefined, requireIdToken: boolean) {
    if (!tokens.id_token) {
      if (requireIdToken) throw new ValidationError("invalid_response", "openid scope was requested but no id_token came back");
      return { tokens };
    }
    const claims = await verifyIdToken(tokens.id_token, metadata, jwks, { clientId: options.clientId, nonce, maxAge });
    return { tokens, claims };
  }

  return {
    metadata,
    clientId: options.clientId,

    async startLogin(login = {}) {
      const pkce = await createPkce();
      const transaction: LoginTransaction = {
        state: randomString(),
        nonce: randomString(),
        codeVerifier: pkce.verifier,
        redirectUri: options.redirectUri,
        maxAge: login.maxAge,
        createdAt: Date.now(),
      };
      const url = buildAuthorizationUrl(metadata, {
        clientId: options.clientId,
        redirectUri: options.redirectUri,
        scope: login.scope ?? scope,
        state: transaction.state,
        nonce: transaction.nonce,
        codeChallenge: pkce.challenge,
        prompt: login.prompt,
        maxAge: login.maxAge,
        loginHint: login.loginHint,
        extraParams: login.extraParams,
      });
      return { url, transaction };
    },

    async finishLogin(callbackUrl, transaction) {
      const { code } = parseCallback(callbackUrl, { state: transaction.state, metadata });
      const tokens = await exchangeCode(
        metadata,
        credentials,
        { code, redirectUri: transaction.redirectUri, codeVerifier: transaction.codeVerifier },
        fetchOptions,
      );
      const requested = (tokens.scope ?? scope).split(" ").includes("openid");
      return verify(tokens, transaction.nonce, transaction.maxAge, requested);
    },

    async refresh(refreshToken) {
      const tokens = await refreshTokens(metadata, credentials, refreshToken, fetchOptions);
      // 갱신 응답의 ID 토큰에는 nonce가 없을 수 있다 (OIDC Core 12.2)
      return verify(tokens, undefined, undefined, false);
    },

    revoke(token, tokenTypeHint) {
      return revokeToken(metadata, credentials, token, { ...fetchOptions, tokenTypeHint });
    },

    userInfo(accessToken, expectedSub) {
      return fetchUserInfo(metadata, accessToken, { ...fetchOptions, expectedSub });
    },

    logoutUrl(request = {}) {
      return buildLogoutUrl(metadata, { clientId: options.clientId, ...request });
    },
  };
}
