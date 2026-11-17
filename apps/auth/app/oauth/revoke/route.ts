import { getPrisma } from "@/cloudflare";
import { hashSecret } from "@/lib/crypto";
import { authenticateClient, CORS_HEADERS, oauthError, preflight, readForm, repeatedParam } from "@/lib/oauth/http";
import { verifyAccessToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * RFC 7009 Token Revocation. 서비스의 로그아웃에서 refresh token을 끊을 때 쓴다.
 * 없거나 이미 끊긴 토큰이어도 200을 준다 (2.2, 토큰 존재 여부를 알려주지 않기 위해).
 * access token은 짧게(1시간) 사는 서명된 JWT라 끊을 수 없다. 이 앱의 유효한 access token이 오면
 * 끊긴 줄 알지 않게 unsupported_token_type으로 알린다 (2.2.1). refresh token을 폐기하면 된다.
 */
export async function POST(request: Request) {
  const form = await readForm(request);
  if (!form) {
    return oauthError("invalid_request", "content-type must be application/x-www-form-urlencoded");
  }

  const repeated = repeatedParam(form);
  if (repeated) return oauthError("invalid_request", `${repeated} must not be repeated`);

  const service = await authenticateClient(request, form);
  if (!service) return oauthError("invalid_client", "client authentication failed", 401);

  const token = form.get("token");
  if (!token) return oauthError("invalid_request", "token is required");

  const { count } = await getPrisma().refreshToken.updateMany({
    where: { tokenHash: await hashSecret(token), serviceId: service.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    const accessToken = await verifyAccessToken(token).catch(() => null);
    if (accessToken?.client_id === service.clientId) {
      return oauthError("unsupported_token_type", "access tokens expire on their own; revoke the refresh token instead");
    }
  }

  return new Response(null, { status: 200, headers: CORS_HEADERS });
}
