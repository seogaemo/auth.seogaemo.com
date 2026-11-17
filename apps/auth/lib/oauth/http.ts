import type { Service } from "@prisma/client";

import { findServiceByClientId, isPublicClient, verifyClientSecret } from "../service";

/**
 * 토큰, userinfo, revoke 엔드포인트는 SPA가 직접 부를 수 있어야 한다.
 * 쿠키를 쓰지 않으므로 모든 origin을 허용해도 된다.
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** 토큰, 오류 응답. 캐시하면 안 된다 (RFC 6749 5.1: Cache-Control no-store, Pragma no-cache) */
export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache", ...headers },
  });
}

/**
 * 같은 파라미터가 두 번 이상 왔으면 그 이름 (RFC 6749 3.1, 3.2: 요청 파라미터는 한 번만).
 * 어느 값을 믿을지 모호하면 공격에 쓰일 수 있어서 요청 자체를 거절한다.
 */
export function repeatedParam(params: URLSearchParams) {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/** RFC 6749 5.2 오류 응답 */
export function oauthError(error: string, description: string, status = 400) {
  const headers: HeadersInit =
    status === 401 ? { "WWW-Authenticate": 'Basic realm="seogaemo"' } : {};
  return json({ error, error_description: description }, status, headers);
}

export async function readForm(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded")) return null;
  return new URLSearchParams(await request.text());
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const index = decoded.indexOf(":");
    if (index < 0) return null;
    // RFC 6749 2.3.1: id와 secret은 form-urlencode된 값이다 (공백이 +로 온다)
    const formDecode = (value: string) => decodeURIComponent(value.replace(/\+/g, " "));
    return {
      clientId: formDecode(decoded.slice(0, index)),
      clientSecret: formDecode(decoded.slice(index + 1)),
    };
  } catch {
    return null;
  }
}

/**
 * client_secret_basic, client_secret_post, none(public client) 순으로 클라이언트를 인증한다.
 * 실패하면 null.
 */
export async function authenticateClient(
  request: Request,
  form: URLSearchParams,
): Promise<Service | null> {
  const basic = parseBasicAuth(request.headers.get("authorization"));
  const clientId = basic?.clientId ?? form.get("client_id");
  const clientSecret = basic?.clientSecret ?? form.get("client_secret");
  if (!clientId) return null;

  const service = await findServiceByClientId(clientId);
  if (!service) return null;

  if (isPublicClient(service)) {
    // public client는 시크릿을 보내면 안 된다. PKCE로만 인증한다.
    return clientSecret ? null : service;
  }

  if (!clientSecret) return null;
  return (await verifyClientSecret(service, clientSecret)) ? service : null;
}
