import { ValidationError } from "./errors.js";

/** OpenID Connect Discovery 1.0 3 / RFC 8414 2 중 이 클라이언트가 쓰는 항목 */
export interface ServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  id_token_signing_alg_values_supported?: string[];
  prompt_values_supported?: string[];
  /** RFC 9207. true면 콜백의 iss를 반드시 확인한다 */
  authorization_response_iss_parameter_supported?: boolean;
  [key: string]: unknown;
}

/** Seogaemo SSO 운영 서버 */
export const SEOGAEMO_ISSUER = "https://auth.seogaemo.com";

export interface FetchOptions {
  /** 기본은 전역 fetch. 테스트나 프록시, 캐시가 필요하면 바꾼다. */
  fetch?: typeof fetch;
}

/**
 * `{issuer}/.well-known/openid-configuration`을 읽는다.
 * 응답의 issuer가 요청한 issuer와 정확히 같아야 한다 (OIDC Discovery 4.3, 다른 서버로 바꿔치기 방지).
 */
export async function discover(issuer: string = SEOGAEMO_ISSUER, options: FetchOptions = {}): Promise<ServerMetadata> {
  const doFetch = options.fetch ?? fetch;
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await doFetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new ValidationError("invalid_metadata", `discovery failed: ${response.status} ${url}`);
  }
  const metadata = (await response.json()) as ServerMetadata;
  if (metadata.issuer !== issuer) {
    throw new ValidationError("issuer_mismatch", `discovery issuer ${metadata.issuer} does not match ${issuer}`);
  }
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof metadata[key] !== "string") throw new ValidationError("invalid_metadata", `discovery is missing ${key}`);
  }
  return metadata;
}
