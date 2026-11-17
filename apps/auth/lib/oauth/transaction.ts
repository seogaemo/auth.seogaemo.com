import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { EMAIL_CODE_COOKIE, LOGIN_TX_COOKIE } from "../config";

/** 쿠키의 transaction id로 진행 중인 로그인을 찾는다. 만료됐으면 null. */
export async function findActiveTransaction(transactionId: string | undefined) {
  if (!transactionId) return null;

  const transaction = await getPrisma().loginTransaction.findUnique({
    where: { id: transactionId },
    include: { service: true },
  });
  if (!transaction || transaction.expiresAt < new Date()) return null;

  return transaction;
}

/** 서비스로 돌아가는 응답. 로그인 진행 쿠키를 지운다. */
export function redirectToClientUrl(url: string) {
  const response = NextResponse.redirect(url, 302);
  response.cookies.delete(LOGIN_TX_COOKIE);
  response.cookies.delete(EMAIL_CODE_COOKIE);
  return response;
}
