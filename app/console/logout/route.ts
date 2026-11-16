import { NextResponse } from "next/server";

import { CONSOLE_SESSION_COOKIE } from "@/lib/config";

export const dynamic = "force-dynamic";

/** POST만 받는다 (링크나 이미지로 로그아웃시키는 것을 막기 위해) */
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/console/login", request.url), 303);
  response.cookies.delete(CONSOLE_SESSION_COOKIE);
  return response;
}
