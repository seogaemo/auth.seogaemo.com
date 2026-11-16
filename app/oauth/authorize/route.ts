import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { LOGIN_TX_COOKIE, SUPPORTED_SCOPES, TTL } from "@/lib/config";
import { findServiceByClientId, getProviders, isRegisteredRedirectUri } from "@/lib/service";
import { loginErrorUrl } from "@/lib/oauth/errors";

export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Authorization Endpoint (Authorization Code + PKCE만 지원)
 *
 * client_id, redirect_uri가 잘못되면 서비스로 돌려보내지 않고 우리 오류 화면을 보여준다
 * (RFC 6749 4.1.2.1). 그 외 오류는 redirect_uri로 error를 붙여 돌려보낸다.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
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

  if (getProviders(service).length === 0) {
    return NextResponse.redirect(loginErrorUrl("no_provider"), 302);
  }

  const transaction = await getPrisma().loginTransaction.create({
    data: {
      serviceId: service.id,
      redirectUri,
      state,
      scope,
      nonce: params.get("nonce"),
      codeChallenge,
      codeChallengeMethod,
      expiresAt: new Date(Date.now() + TTL.loginTransactionMs),
    },
  });

  const response = NextResponse.redirect(new URL("/login", request.url), 302);

  // 로그인 진행은 이 브라우저에 묶는다. 콜백에서 쿠키와 transaction id가 같아야 한다.
  response.cookies.set(LOGIN_TX_COOKIE, transaction.id, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: TTL.loginTransactionMs / 1000,
  });

  return response;
}
