import { OAuthError, ValidationError } from "./errors.js";
import type { ServerMetadata } from "./metadata.js";

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  /** 기본 "openid email profile" */
  scope?: string;
  /** CSRF 방지 (RFC 6749 10.12). createPkce와 함께 randomString()으로 만들어 저장해 둔다. */
  state: string;
  /** PKCE challenge (RFC 7636). public client는 필수, confidential client도 쓰는 걸 권한다 (OAuth 2.1). */
  codeChallenge: string;
  /** ID 토큰 재사용 방지 (OIDC Core 3.1.2.1). scope에 openid가 있으면 넣는 걸 권한다. */
  nonce?: string;
  /** none | login | consent | select_account (공백으로 여러 개) */
  prompt?: string;
  /** 초. 마지막 로그인이 이보다 오래됐으면 다시 로그인시킨다 */
  maxAge?: number;
  loginHint?: string;
  /** 그 밖의 파라미터. 위 항목과 겹치면 이 값이 이긴다 */
  extraParams?: Record<string, string>;
}

/** 브라우저(또는 ASWebAuthenticationSession, Custom Tabs)로 열 authorize 주소 */
export function buildAuthorizationUrl(metadata: Pick<ServerMetadata, "authorization_endpoint">, request: AuthorizationRequest): URL {
  const url = new URL(metadata.authorization_endpoint);
  const params: Record<string, string | undefined> = {
    response_type: "code",
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    scope: request.scope ?? "openid email profile",
    state: request.state,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
    nonce: request.nonce,
    prompt: request.prompt,
    max_age: request.maxAge === undefined ? undefined : String(request.maxAge),
    login_hint: request.loginHint,
    ...request.extraParams,
  };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

export interface CallbackCheck {
  /** authorize 요청에 보낸 state */
  state: string;
  /** 서버 메타데이터. iss 확인 (RFC 9207)에 쓴다 */
  metadata: Pick<ServerMetadata, "issuer" | "authorization_response_iss_parameter_supported">;
}

/**
 * redirect_uri로 돌아온 주소를 검사하고 code를 꺼낸다.
 *
 * 순서: state 확인 -> iss 확인 (RFC 9207 2.4) -> error면 OAuthError -> code.
 * state와 iss를 오류 응답보다 먼저 보는 건, 위조된 오류 응답으로 사용자를 혼란시키는 걸 막기 위해서다.
 */
export function parseCallback(callbackUrl: string | URL, check: CallbackCheck): { code: string } {
  const url = typeof callbackUrl === "string" ? new URL(callbackUrl) : callbackUrl;
  // 일부 서버는 fragment로 보내지만 이 클라이언트는 query 응답 모드만 쓴다
  const params = url.searchParams;

  if (params.get("state") !== check.state) {
    throw new ValidationError("state_mismatch", "state does not match the authorization request");
  }

  const iss = params.get("iss");
  if (iss !== null || check.metadata.authorization_response_iss_parameter_supported) {
    if (iss !== check.metadata.issuer) {
      throw new ValidationError("issuer_mismatch", `callback iss ${iss ?? "(missing)"} does not match ${check.metadata.issuer}`);
    }
  }

  const error = params.get("error");
  if (error) throw new OAuthError(error, params.get("error_description") ?? undefined);

  const code = params.get("code");
  if (!code) throw new ValidationError("missing_code", "callback has neither code nor error");
  return { code };
}
