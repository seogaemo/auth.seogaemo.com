import { NextResponse } from "next/server";

import { BROWSER_COOKIE } from "@/lib/config";
import { endBrowserSessions, endSession } from "@/lib/oauth/session";
import { findServiceByClientId, isAllowedPostLogoutUri } from "@/lib/service";
import { verifyIdTokenHint } from "@/lib/token";

export const dynamic = "force-dynamic";

/**
 * OIDC RP-Initiated Logout (end_session_endpoint).
 *
 * id_token_hint나 client_id로 서비스를 알면 이 브라우저의 그 서비스 세션만 끝내고,
 * 둘 다 없으면 이 브라우저의 모든 세션을 끝낸다. 세션에서 나온 refresh token도 같이 끊긴다.
 * post_logout_redirect_uri는 등록된 Redirect URI와 origin이 같을 때만 따른다.
 */
async function handle(request: Request, params: URLSearchParams) {
  const hint = params.get("id_token_hint");
  const clientId = params.get("client_id");
  const postLogout = params.get("post_logout_redirect_uri");
  const state = params.get("state");

  const claims = hint ? await verifyIdTokenHint(hint) : null;
  const hintAudience = claims ? (Array.isArray(claims.aud) ? claims.aud[0] : claims.aud) : null;
  if (hint && !claims) return page(request, null, "invalid_hint");
  if (clientId && hintAudience && clientId !== hintAudience) return page(request, null, "invalid_hint");

  const serviceClientId = hintAudience ?? clientId;
  const service = serviceClientId ? await findServiceByClientId(serviceClientId) : null;
  if (serviceClientId && !service) return page(request, null, "invalid_client");

  const browserKey = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${BROWSER_COOKIE}=([^;]+)`))?.[1];
  const key = browserKey ? decodeURIComponent(browserKey) : null;
  if (service) await endSession(key, service.id);
  else await endBrowserSessions(key);

  if (postLogout && service && isAllowedPostLogoutUri(service, postLogout)) {
    const url = new URL(postLogout);
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url.toString(), 302);
  }
  return page(request, service?.clientId ?? null, postLogout ? "invalid_redirect" : null);
}

function page(request: Request, clientId: string | null, error: string | null) {
  const url = new URL("/logout", request.url);
  if (clientId) url.searchParams.set("client_id", clientId);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, 302);
}

export async function GET(request: Request) {
  return handle(request, new URL(request.url).searchParams);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const params = new URLSearchParams();
  for (const [key, value] of form?.entries() ?? []) if (typeof value === "string") params.set(key, value);
  // 폼 POST 응답은 303이어야 브라우저가 GET으로 따라간다
  const response = await handle(request, params);
  return NextResponse.redirect(response.headers.get("location")!, 303);
}
