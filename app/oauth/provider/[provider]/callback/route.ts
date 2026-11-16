import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { getIssuer, isProvider, LOGIN_TX_COOKIE, TTL } from "@/lib/config";
import { hashSecret, randomToken } from "@/lib/crypto";
import { loginErrorUrl } from "@/lib/oauth/errors";
import { completeProviderLogin } from "@/lib/oauth/providers";
import { redirectToClient } from "@/lib/oauth/transaction";
import { upsertUserFromProfile } from "@/lib/oauth/users";

export const dynamic = "force-dynamic";

/** 외부 제공자 로그인이 끝나면 돌아오는 곳. 사용자를 확정하고 서비스에 code를 넘긴다. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const query = new URL(request.url).searchParams;
  const providerState = query.get("state");
  if (!isProvider(provider) || !providerState) {
    return NextResponse.redirect(loginErrorUrl("expired"), 302);
  }

  const prisma = getPrisma();
  const transaction = await prisma.loginTransaction.findUnique({
    where: { providerState },
  });
  const cookieTxId = (await cookies()).get(LOGIN_TX_COOKIE)?.value;

  // state가 이 브라우저에서 시작한 로그인과 맞는지 확인한다 (CSRF, 로그인 가로채기 방지)
  if (
    !transaction ||
    transaction.id !== cookieTxId ||
    transaction.provider !== provider ||
    transaction.expiresAt < new Date()
  ) {
    return NextResponse.redirect(loginErrorUrl("expired"), 302);
  }

  // 한 번 쓰면 끝이다
  await prisma.loginTransaction.delete({ where: { id: transaction.id } });
  const issuer = getIssuer();

  const code = query.get("code");
  if (!code) {
    // 사용자가 동의 화면에서 취소한 경우 등
    return redirectToClient(
      transaction,
      { error: "access_denied", error_description: "login was cancelled" },
      issuer,
    );
  }

  let user;
  try {
    const profile = await completeProviderLogin(
      provider,
      code,
      transaction.providerCodeVerifier,
    );
    user = await upsertUserFromProfile(transaction.serviceId, provider, profile);
  } catch (error) {
    console.error("provider login failed", provider, error);
    return NextResponse.redirect(loginErrorUrl("provider_failed"), 302);
  }

  const authorizationCode = randomToken();
  await prisma.authorizationCode.create({
    data: {
      codeHash: await hashSecret(authorizationCode),
      serviceId: transaction.serviceId,
      userId: user.id,
      redirectUri: transaction.redirectUri,
      scope: transaction.scope,
      nonce: transaction.nonce,
      codeChallenge: transaction.codeChallenge,
      codeChallengeMethod: transaction.codeChallengeMethod,
      expiresAt: new Date(Date.now() + TTL.authorizationCodeMs),
    },
  });

  return redirectToClient(transaction, { code: authorizationCode }, issuer);
}
