import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  CONSOLE_CLIENT_ID,
  CONSOLE_LOGIN_COOKIE,
  CONSOLE_SESSION_COOKIE,
  endpoint,
  getIssuer,
  TTL,
} from "@/lib/config";
import { timingSafeEqual } from "@/lib/crypto";
import { consumeAuthorizationCode } from "@/lib/oauth/codes";
import { findServiceByClientId } from "@/lib/service";
import { signConsoleSession } from "@/lib/token";

export const dynamic = "force-dynamic";

function failed(request: Request) {
  const response = NextResponse.redirect(new URL("/console/login?error=1", request.url), 302);
  response.cookies.delete({ name: CONSOLE_LOGIN_COOKIE, path: "/console" });
  return response;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const code = query.get("code");
  const state = query.get("state");

  let saved: { state?: string; verifier?: string } = {};
  try {
    saved = JSON.parse((await cookies()).get(CONSOLE_LOGIN_COOKIE)?.value ?? "{}");
  } catch {}

  if (
    !code ||
    !state ||
    !saved.state ||
    !saved.verifier ||
    !timingSafeEqual(state, saved.state) ||
    query.get("iss") !== getIssuer()
  ) {
    return failed(request);
  }

  const service = await findServiceByClientId(CONSOLE_CLIENT_ID);
  if (!service) return failed(request);

  // 같은 워커 안이라 HTTP 토큰 엔드포인트를 거치지 않고 code를 바로 검증한다
  const result = await consumeAuthorizationCode(service, {
    code,
    redirectUri: endpoint("/console/callback"),
    codeVerifier: saved.verifier,
  });
  if (!result.ok) return failed(request);

  const response = NextResponse.redirect(new URL("/console", request.url), 302);
  response.cookies.delete({ name: CONSOLE_LOGIN_COOKIE, path: "/console" });
  response.cookies.set(CONSOLE_SESSION_COOKIE, await signConsoleSession(result.record.userId), {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: TTL.consoleSessionSec,
  });
  return response;
}
