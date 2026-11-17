import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { BROWSER_COOKIE, endpoint, LOGIN_TX_COOKIE, TTL } from "@/lib/config";
import { loginErrorUrl } from "@/lib/oauth/errors";
import { browserCookieOptions, newBrowserKey } from "@/lib/oauth/session";
import { findServiceByClientId, getProviders } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * 계정 화면용 로그인 시작. 서비스로 code를 보내지 않고, 로그인이 끝나면 /account로 돌아온다.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const clientId = requestUrl.searchParams.get("client_id");
  const service = clientId ? await findServiceByClientId(clientId) : null;
  if (!service) return NextResponse.redirect(loginErrorUrl("invalid_client"), 302);
  if (getProviders(service).length === 0) return NextResponse.redirect(loginErrorUrl("no_provider"), 302);

  const returnTo = endpoint(`/account?client_id=${encodeURIComponent(service.clientId)}`);
  const transaction = await getPrisma().loginTransaction.create({
    data: {
      serviceId: service.id,
      redirectUri: returnTo,
      returnTo,
      scope: "openid",
      codeChallenge: "",
      codeChallengeMethod: "",
      prompt: "login",
      expiresAt: new Date(Date.now() + TTL.loginTransactionMs),
    },
  });

  const secure = requestUrl.protocol === "https:";
  const response = NextResponse.redirect(new URL("/login", request.url), 302);
  response.cookies.set(LOGIN_TX_COOKIE, transaction.id, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL.loginTransactionMs / 1000,
  });
  if (!request.headers.get("cookie")?.includes(`${BROWSER_COOKIE}=`)) {
    response.cookies.set(BROWSER_COOKIE, newBrowserKey(), browserCookieOptions(secure));
  }
  return response;
}
