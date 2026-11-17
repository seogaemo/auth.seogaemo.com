/**
 * @seogaemo/oauth: Seogaemo SSO용 표준 OAuth 2.0 / OpenID Connect 클라이언트.
 * fetch와 WebCrypto만 쓴다 (브라우저, Node 20+, Cloudflare Workers, Deno, Bun).
 *
 * 대부분은 createClient 하나면 된다. 흐름을 직접 짜려면 아래 함수들을 따로 쓴다.
 */
export { createClient } from "./client.js";
export type { ClientOptions, LoginOptions, LoginResult, LoginTransaction, OAuthClient } from "./client.js";

export { discover, SEOGAEMO_ISSUER } from "./metadata.js";
export type { FetchOptions, ServerMetadata } from "./metadata.js";

export { createPkce, pkceChallenge } from "./pkce.js";
export type { Pkce } from "./pkce.js";

export { buildAuthorizationUrl, parseCallback } from "./authorize.js";
export type { AuthorizationRequest, CallbackCheck } from "./authorize.js";

export { exchangeCode, refreshTokens, revokeToken } from "./token.js";
export type { ClientAuthMethod, ClientCredentials, TokenResponse } from "./token.js";

export { RemoteJwks, verifyIdToken } from "./jwt.js";
export type { IdTokenCheck, IdTokenClaims, JsonWebKeySet } from "./jwt.js";

export { fetchUserInfo } from "./userinfo.js";
export type { UserInfo } from "./userinfo.js";

export { buildLogoutUrl } from "./logout.js";
export type { LogoutRequest } from "./logout.js";

export { OAuthError, ValidationError } from "./errors.js";
export { randomString } from "./encoding.js";
