import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { BROWSER_COOKIE, LOGIN_TX_COOKIE, SUPPORTED_PROMPTS, SUPPORTED_SCOPES, TTL } from "@/lib/config";
import { continueWithSession } from "@/lib/oauth/complete";
import { loginErrorUrl } from "@/lib/oauth/errors";
import { browserCookieOptions, findSession, isAuthTooOld, newBrowserKey } from "@/lib/oauth/session";
import { findServiceByClientId, getProviders, isRegisteredRedirectUri } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Authorization Endpoint (Authorization Code + PKCE만 지원)
 *
 * client_id, redirect_uri가 잘못되면 서비스로 돌려보내지 않고 우리 오류 화면을 보여준다
 * (RFC 6749 4.1.2.1). 그 외 오류는 redirect_uri로 error를 붙여 돌려보낸다.
 *
 * 이 브라우저에 이 서비스의 로그인 세션이 살아 있으면 로그인 화면 없이 바로 code를 준다.
 * OIDC prompt, max_age로 바꿀 수 있다:
 * - prompt=none: 화면을 띄우지 않는다. 세션이 없으면 error=login_required
 * - prompt=login, 또는 max_age보다 오래된 인증: 다시 로그인
 * - prompt=select_account: "이 계정으로 계속" 화면
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const params = requestUrl.searchParams;
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");

  if (!clientId) return NextResponse.redirect(loginErrorUrl("invalid_client"), 302);
  const service = await findServiceByClientId(clientId);
  if (!service) return NextResponse.redirect(loginErrorUrl("invalid_client"), 302);
  if (!redirectUri || !isRegisteredRedirectUri(service, redirectUri)) {
    return NextResponse.redirect(loginErrorUrl("invalid_redirect_uri"), 302);
  }

  const fail = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url.toString(), 302);
  };

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "response_type must be code");
  }

  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  if (!codeChallenge || !/^[A-Za-z0-9\-_]{43}$/.test(codeChallenge)) {
    return fail("invalid_request", "code_challenge (S256) is required");
  }
  if (codeChallengeMethod !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256");
  }

  const requested = (params.get("scope") ?? "openid").split(" ").filter(Boolean);
  const unknown = requested.filter((s) => !(SUPPORTED_SCOPES as readonly string[]).includes(s));
  if (unknown.length > 0) {
    return fail("invalid_scope", `unsupported scope: ${unknown.join(" ")}`);
  }
  const scope = [...new Set(requested)].join(" ") || "openid";

  const prompts = (params.get("prompt") ?? "").split(" ").filter(Boolean);
  if (prompts.some((p) => !(SUPPORTED_PROMPTS as readonly string[]).includes(p))) {
    return fail("invalid_request", "unsupported prompt value");
  }
  if (prompts.includes("none") && prompts.length > 1) {
    return fail("invalid_request", "prompt=none cannot be combined with other values");
  }

  const maxAgeParam = params.get("max_age");
  const maxAge = maxAgeParam === null ? null : Number(maxAgeParam);
  if (maxAge !== null && (!Number.isInteger(maxAge) || maxAge < 0)) {
    return fail("invalid_request", "max_age must be a non-negative integer");
  }

  if (getProviders(service).length === 0) {
    return NextResponse.redirect(loginErrorUrl("no_provider"), 302);
  }

  // 브라우저 쿠키가 없으면 여기서 심는다. 로그인을 마칠 때 이 값으로 세션을 만든다.
  const cookieKey = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${BROWSER_COOKIE}=([^;]+)`))?.[1];
  const browserKey = cookieKey ? decodeURIComponent(cookieKey) : newBrowserKey();
  const secure = requestUrl.protocol === "https:";
  const withBrowserCookie = (response: NextResponse) => {
    if (!cookieKey) response.cookies.set(BROWSER_COOKIE, browserKey, browserCookieOptions(secure));
    return response;
  };

  const codeRequest = {
    serviceId: service.id,
    redirectUri,
    state,
    scope,
    nonce: params.get("nonce"),
    codeChallenge,
    codeChallengeMethod,
  };

  const session = cookieKey ? await findSession(browserKey, service.id) : null;
  const sessionUsable = session && !isAuthTooOld(session, maxAge);
  const forceLogin = prompts.includes("login") || (session && !sessionUsable);

  if (prompts.includes("none")) {
    if (!session || !sessionUsable) return fail("login_required", "no active login session");
    return NextResponse.redirect(await continueWithSession(codeRequest, session), 302);
  }

  if (session && sessionUsable && !forceLogin && !prompts.includes("select_account")) {
    return NextResponse.redirect(await continueWithSession(codeRequest, session), 302);
  }

  const transaction = await getPrisma().loginTransaction.create({
    data: {
      ...codeRequest,
      prompt: prompts.join(" ") || null,
      maxAge,
      loginHint: params.get("login_hint")?.slice(0, 254) || null,
      expiresAt: new Date(Date.now() + TTL.loginTransactionMs),
    },
  });

  const next = sessionUsable && prompts.includes("select_account") ? "/login/continue" : "/login";
  const response = NextResponse.redirect(new URL(next, request.url), 302);

  // 로그인 진행은 이 브라우저에 묶는다. 콜백에서 쿠키와 transaction id가 같아야 한다.
  response.cookies.set(LOGIN_TX_COOKIE, transaction.id, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL.loginTransactionMs / 1000,
  });

  return withBrowserCookie(response);
}
