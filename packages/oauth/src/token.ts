import { OAuthError, ValidationError } from "./errors.js";
import type { FetchOptions, ServerMetadata } from "./metadata.js";

/**
 * 토큰 엔드포인트에서 클라이언트를 인증하는 방법 (RFC 6749 2.3, OIDC Core 9).
 * - client_secret_basic: Authorization 헤더 (시크릿이 있으면 기본)
 * - client_secret_post: 본문에 client_id, client_secret
 * - none: public client (모바일, SPA). client_id만 보내고 PKCE로 증명한다 (시크릿이 없으면 기본)
 */
export type ClientAuthMethod = "client_secret_basic" | "client_secret_post" | "none";

export interface ClientCredentials {
  clientId: string;
  /** 서버에서만. 브라우저, 앱 번들에는 절대 넣지 않는다 */
  clientSecret?: string;
  authMethod?: ClientAuthMethod;
}

/** RFC 6749 5.1, OIDC Core 3.1.3.3 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  [key: string]: unknown;
}

type Endpoint = Pick<ServerMetadata, "token_endpoint">;

/** RFC 6749 2.3.1: Basic 인증 전에 id와 secret을 각각 form-urlencode 한다 */
function formEncode(value: string) {
  return new URLSearchParams({ v: value }).toString().slice(2);
}

function authenticate(client: ClientCredentials, body: URLSearchParams, headers: Headers) {
  const method = client.authMethod ?? (client.clientSecret ? "client_secret_basic" : "none");
  if (method !== "none" && !client.clientSecret) {
    throw new TypeError(`${method} needs clientSecret`);
  }
  switch (method) {
    case "client_secret_basic":
      headers.set("Authorization", `Basic ${btoa(`${formEncode(client.clientId)}:${formEncode(client.clientSecret!)}`)}`);
      break;
    case "client_secret_post":
      body.set("client_id", client.clientId);
      body.set("client_secret", client.clientSecret!);
      break;
    case "none":
      body.set("client_id", client.clientId);
      break;
  }
}

/** 폼으로 POST하고 RFC 6749 5.2 오류 응답을 OAuthError로 바꾼다 */
export async function postForm(
  url: string,
  client: ClientCredentials,
  params: Record<string, string | undefined>,
  options: FetchOptions = {},
): Promise<Response> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) body.set(key, value);
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" });
  authenticate(client, body, headers);

  const response = await (options.fetch ?? fetch)(url, { method: "POST", headers, body });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { error?: unknown; error_description?: unknown } | null;
    throw new OAuthError(
      typeof error?.error === "string" ? error.error : "server_error",
      typeof error?.error_description === "string" ? error.error_description : `HTTP ${response.status}`,
      response.status,
    );
  }
  return response;
}

async function readTokenResponse(response: Response): Promise<TokenResponse> {
  const token = (await response.json()) as TokenResponse;
  if (typeof token.access_token !== "string" || typeof token.token_type !== "string") {
    throw new ValidationError("invalid_response", "token response is missing access_token or token_type");
  }
  // RFC 6749 7.1: token_type은 대소문자를 구분하지 않는다. 이 서버는 Bearer만 준다
  if (token.token_type.toLowerCase() !== "bearer") {
    throw new ValidationError("invalid_response", `unsupported token_type ${token.token_type}`);
  }
  return token;
}

/** authorization_code 교환 (RFC 6749 4.1.3, RFC 7636 4.5) */
export async function exchangeCode(
  metadata: Endpoint,
  client: ClientCredentials,
  request: { code: string; redirectUri: string; codeVerifier: string },
  options: FetchOptions = {},
): Promise<TokenResponse> {
  const response = await postForm(
    metadata.token_endpoint,
    client,
    {
      grant_type: "authorization_code",
      code: request.code,
      redirect_uri: request.redirectUri,
      code_verifier: request.codeVerifier,
    },
    options,
  );
  return readTokenResponse(response);
}

/**
 * refresh_token으로 새 토큰 (RFC 6749 6).
 * 서버는 refresh token을 회전시킨다. 응답의 새 refresh_token을 저장하고 이전 것은 버린다.
 * 이전 것을 다시 쓰면 재사용으로 보고 그 로그인의 토큰을 모두 끊는다.
 */
export async function refreshTokens(
  metadata: Endpoint,
  client: ClientCredentials,
  refreshToken: string,
  options: FetchOptions & { scope?: string } = {},
): Promise<TokenResponse> {
  const response = await postForm(
    metadata.token_endpoint,
    client,
    { grant_type: "refresh_token", refresh_token: refreshToken, scope: options.scope },
    options,
  );
  return readTokenResponse(response);
}

/**
 * 토큰 폐기 (RFC 7009). 로그아웃할 때 refresh token을 넘긴다.
 * 이미 없는 토큰이어도 서버는 200을 준다 (2.2).
 */
export async function revokeToken(
  metadata: Pick<ServerMetadata, "revocation_endpoint">,
  client: ClientCredentials,
  token: string,
  options: FetchOptions & { tokenTypeHint?: "refresh_token" | "access_token" } = {},
): Promise<void> {
  if (!metadata.revocation_endpoint) throw new TypeError("server has no revocation_endpoint");
  await postForm(metadata.revocation_endpoint, client, { token, token_type_hint: options.tokenTypeHint }, options);
}
