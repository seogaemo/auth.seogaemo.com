import type { LoginTransaction } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { getIssuer, TTL } from "../config";
import { hashSecret, randomToken } from "../crypto";

/** 서비스 redirect_uri에 결과를 붙인 주소 (state, RFC 9207 iss 포함) */
export function clientRedirectUrl(
  transaction: Pick<LoginTransaction, "redirectUri" | "state">,
  params: Record<string, string>,
) {
  const url = new URL(transaction.redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (transaction.state) url.searchParams.set("state", transaction.state);
  url.searchParams.set("iss", getIssuer());
  return url.toString();
}

/**
 * 사용자가 확정되면 로그인 진행을 끝내고 authorization code를 발급한다.
 * 돌아갈 주소(서비스 redirect_uri?code=...)를 돌려준다. 호출한 쪽에서 로그인 쿠키를 지운다.
 */
export async function finishLogin(transaction: LoginTransaction, userId: string) {
  const prisma = getPrisma();
  const code = randomToken();

  await prisma.authorizationCode.create({
    data: {
      codeHash: await hashSecret(code),
      serviceId: transaction.serviceId,
      userId,
      redirectUri: transaction.redirectUri,
      scope: transaction.scope,
      nonce: transaction.nonce,
      codeChallenge: transaction.codeChallenge,
      codeChallengeMethod: transaction.codeChallengeMethod,
      expiresAt: new Date(Date.now() + TTL.authorizationCodeMs),
    },
  });
  // 한 번 쓰면 끝 (이미 지워졌어도 괜찮다)
  await prisma.loginTransaction.deleteMany({ where: { id: transaction.id } });

  return clientRedirectUrl(transaction, { code });
}
