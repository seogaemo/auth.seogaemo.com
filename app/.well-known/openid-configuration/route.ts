import { getIssuer, SUPPORTED_PROMPTS, SUPPORTED_SCOPES } from "@/lib/config";
import { CORS_HEADERS } from "@/lib/oauth/http";

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
      grant_types_supported: ["authorization_code", "refresh_token"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
      scopes_supported: SUPPORTED_SCOPES,
      claims_supported: ["sub", "iss", "aud", "exp", "iat", "auth_time", "nonce", "sid", "email", "email_verified", "name", "picture"],
      prompt_values_supported: SUPPORTED_PROMPTS,
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
      revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } },
  );
}
