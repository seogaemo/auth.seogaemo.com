import { getPrisma } from "@/cloudflare";
import { hashSecret } from "@/lib/crypto";
import { authenticateClient, CORS_HEADERS, oauthError, preflight, readForm } from "@/lib/oauth/http";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * RFC 7009 Token Revocation. 서비스의 로그아웃에서 refresh token을 끊을 때 쓴다.
 * access token은 짧게(1시간) 살고 상태가 없어서 따로 폐기하지 않는다.
 * 없는 토큰이어도 200을 준다 (토큰 존재 여부를 알려주지 않기 위해).
 */
export async function POST(request: Request) {
  const form = await readForm(request);
  if (!form) {
    return oauthError("invalid_request", "content-type must be application/x-www-form-urlencoded");
  }

  const service = await authenticateClient(request, form);
  if (!service) return oauthError("invalid_client", "client authentication failed", 401);

  const token = form.get("token");
  if (!token) return oauthError("invalid_request", "token is required");

  await getPrisma().refreshToken.updateMany({
    where: { tokenHash: await hashSecret(token), serviceId: service.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return new Response(null, { status: 200, headers: CORS_HEADERS });
}
