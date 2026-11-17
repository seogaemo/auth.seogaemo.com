import { getIssuer, SUPPORTED_PROMPTS, SUPPORTED_SCOPES } from "@/lib/config";
import { CORS_HEADERS } from "@/lib/oauth/http";
import { idTokenAlgsSupported } from "@/lib/token";

export const dynamic = "force-dynamic";

/** OIDC Discovery. 기존 OIDC 라이브러리는 이 주소만 알면 붙일 수 있다. */
export function GET() {
  const issuer = getIssuer();

  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      userinfo_endpoint: `${issuer}/oauth/userinfo`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      end_session_endpoint: `${issuer}/oauth/logout`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      subject_types_supported: ["public"],
      // OIDC Discovery 3: RS256은 반드시 들어가야 한다. 앱마다 콘솔에서 고른다
      id_token_signing_alg_values_supported: idTokenAlgsSupported(),
      scopes_supported: SUPPORTED_SCOPES,
      claims_supported: ["sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "sid", "email", "email_verified", "name", "preferred_username", "picture"],
      prompt_values_supported: SUPPORTED_PROMPTS,
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
      revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
      // 기본값이 request_uri는 true라서 지원하지 않는다고 적어 둔다 (OIDC Discovery 3)
      request_parameter_supported: false,
      request_uri_parameter_supported: false,
      claims_parameter_supported: false,
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } },
  );
}
