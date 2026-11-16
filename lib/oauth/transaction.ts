import type { LoginTransaction } from "@prisma/client";
import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { LOGIN_TX_COOKIE } from "../config";

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

/** 서비스의 redirect_uri로 결과(code 또는 error)를 들고 돌아간다 */
export function redirectToClient(
  transaction: Pick<LoginTransaction, "redirectUri" | "state">,
  params: Record<string, string>,
  issuer: string,
) {
  const url = new URL(transaction.redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (transaction.state) url.searchParams.set("state", transaction.state);
  // RFC 9207: 어느 발급자의 응답인지 알려 mix-up 공격을 막는다
  url.searchParams.set("iss", issuer);

  const response = NextResponse.redirect(url.toString(), 302);
  response.cookies.delete(LOGIN_TX_COOKIE);
  return response;
}
