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

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", ...headers },
  });
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
