import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CONSOLE_CLIENT_ID, CONSOLE_SESSION_COOKIE } from "@/lib/config";
import { currentBrowserKey, endSession } from "@/lib/oauth/session";
import { findServiceByClientId } from "@/lib/service";

export const dynamic = "force-dynamic";

/**
 * POST만 받는다 (링크나 이미지로 로그아웃시키는 것을 막기 위해).
 * 콘솔 쿠키와 함께 이 브라우저의 콘솔 로그인 세션도 끝낸다. 안 그러면 "로그인"을 누르자마자 다시 들어와진다.
 */
export async function POST(request: Request) {
  const service = await findServiceByClientId(CONSOLE_CLIENT_ID);
  if (service) await endSession(await currentBrowserKey(), service.id);

  const response = NextResponse.redirect(new URL("/console/login", request.url), 303);
  (await cookies()).delete(CONSOLE_SESSION_COOKIE);
  response.cookies.delete(CONSOLE_SESSION_COOKIE);
  return response;
}
