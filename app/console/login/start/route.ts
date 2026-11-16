import { NextResponse } from "next/server";

import { CONSOLE_CLIENT_ID, CONSOLE_LOGIN_COOKIE, endpoint } from "@/lib/config";
import { pkceChallenge, randomToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/** 콘솔도 일반 서비스처럼 /oauth/authorize로 로그인한다 (public client + PKCE) */
export async function GET(request: Request) {
  const state = randomToken();
  const verifier = randomToken(48);

  const url = new URL(endpoint("/oauth/authorize"));
  url.searchParams.set("client_id", CONSOLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", endpoint("/console/callback"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(url.toString(), 302);
  response.cookies.set(CONSOLE_LOGIN_COOKIE, JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/console",
    maxAge: 10 * 60,
  });
  return response;
}
