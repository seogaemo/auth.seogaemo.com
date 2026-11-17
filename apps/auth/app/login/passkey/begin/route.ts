import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_TX_COOKIE, TTL } from "@/lib/config";
import { findActiveTransaction } from "@/lib/oauth/transaction";

/**
 * 패스키 저장 제안으로 가는 길목. 로그인 진행 쿠키는 /oauth/authorize에서 10분짜리로 만들어서,
 * 코드를 확인하느라 시간을 쓴 뒤에는 쿠키가 먼저 만료될 수 있다. 서버 액션에서는 쿠키를 바꿀 수 없으니
 * (화면이 다시 그려진다) 여기서 쿠키 수명을 다시 10분으로 늘린 뒤 화면으로 보낸다.
 */
export async function GET(request: NextRequest) {
  const transactionId = request.cookies.get(LOGIN_TX_COOKIE)?.value;
  const transaction = await findActiveTransaction(transactionId);
  if (!transaction?.verifiedUserId) {
    return NextResponse.redirect(new URL(transaction ? "/login" : "/login/error?code=expired", request.url), 302);
  }

  const response = NextResponse.redirect(new URL("/login/passkey", request.url), 302);
  response.cookies.set(LOGIN_TX_COOKIE, transaction.id, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: TTL.loginTransactionMs / 1000,
  });
  return response;
}
