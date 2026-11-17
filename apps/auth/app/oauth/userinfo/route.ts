import { getPrisma } from "@/cloudflare";
import { json, preflight } from "@/lib/oauth/http";
import { userClaims } from "@/lib/oauth/tokens";
import { verifyAccessToken } from "@/lib/token";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * RFC 6750 3: 오류는 WWW-Authenticate 헤더로 알린다.
 * - 토큰이 아예 없으면 오류 코드 없이 401 (3.1: 인증 정보가 없는 요청에는 error를 넣지 않는다)
 * - 형식이 틀리면 400 invalid_request, 토큰이 틀리면 401 invalid_token, scope가 모자라면 403 insufficient_scope
 */
function challenge(status: 400 | 401 | 403, error?: "invalid_request" | "invalid_token" | "insufficient_scope", extra = "") {
  const params = ['realm="seogaemo"', ...(error ? [`error="${error}"`] : []), ...(extra ? [extra] : [])].join(", ");
  return json(error ? { error } : {}, status, { "WWW-Authenticate": `Bearer ${params}` });
}

/** Authorization 헤더의 Bearer 토큰. 인증 방식 이름은 대소문자를 구분하지 않는다 (RFC 9110 11.1) */
function bearerToken(header: string | null): string | null | "malformed" {
  if (!header) return null;
  const match = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i.exec(header.trim());
  return match ? match[1]! : "malformed";
}

/** OIDC UserInfo Endpoint (Core 5.3) */
export async function GET(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (token === null) return challenge(401);
  if (token === "malformed") return challenge(400, "invalid_request");

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    return challenge(401, "invalid_token");
  }
  // OpenID Connect 인증으로 받은 토큰만 UserInfo를 읽을 수 있다
  if (!claims.scope.split(" ").includes("openid")) return challenge(403, "insufficient_scope", 'scope="openid"');

  const user = await getPrisma().user.findUnique({
    where: { id: claims.sub },
    include: { service: true },
  });
  if (!user || user.service.clientId !== claims.client_id || user.disabledAt) return challenge(401, "invalid_token");

  return json(userClaims(user, claims.scope));
}

export const POST = GET;
