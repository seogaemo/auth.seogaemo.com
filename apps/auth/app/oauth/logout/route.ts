import { NextResponse } from "next/server";

import { BROWSER_COOKIE, getIssuer } from "@/lib/config";
import { endBrowserSessions, endSession } from "@/lib/oauth/session";
import { findServiceByClientId, isAllowedPostLogoutUri } from "@/lib/service";
import { verifyIdTokenHint } from "@/lib/token";

export const dynamic = "force-dynamic";

/**
 * OIDC RP-Initiated Logout (end_session_endpoint).
 *
 * id_token_hint나 client_id로 서비스를 알면 이 브라우저의 그 서비스 세션만 끝내고,
 * 둘 다 없으면 이 브라우저의 모든 세션을 끝낸다. 세션에서 나온 refresh token도 같이 끊긴다.
 * post_logout_redirect_uri는 등록한 "로그아웃 후 이동 주소"와 정확히 같을 때만 따른다 (3.1).
 *
 * 유효한 id_token_hint가 없으면 사용자에게 먼저 묻는다 (2). 다른 사이트가 이 주소를 심어 두고
 * 사용자를 몰래 로그아웃시키지 못하게 하려는 것. 우리 화면(확인 화면, 계정 화면)에서 보낸 POST는 바로 처리한다.
 */
async function handle(request: Request, params: URLSearchParams, sameOrigin: boolean) {
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

  if (!claims && !sameOrigin) {
    const confirm = new URL("/logout/confirm", request.url);
    for (const key of ["client_id", "post_logout_redirect_uri", "state"]) {
      const value = params.get(key);
      if (value) confirm.searchParams.set(key, value);
    }
    return NextResponse.redirect(confirm, 302);
  }

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

/**
 * 우리 화면에서 보낸 폼인지. 다른 사이트의 자동 제출 폼은 Origin이 다르다.
 * 요청이 들어온 주소와 비교한다 (wrangler dev는 주소와 Origin을 둘 다 운영 도메인으로 바꿔 넘긴다).
 */
function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin || origin === new URL(getIssuer()).origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export async function GET(request: Request) {
  return handle(request, new URL(request.url).searchParams, false);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const params = new URLSearchParams();
  for (const [key, value] of form?.entries() ?? []) if (typeof value === "string") params.set(key, value);
  // 폼 POST 응답은 303이어야 브라우저가 GET으로 따라간다
  const response = await handle(request, params, isSameOrigin(request));
  return NextResponse.redirect(response.headers.get("location")!, 303);
}
