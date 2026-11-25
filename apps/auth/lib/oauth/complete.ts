import type { LoginTransaction, Session } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { getIssuer, TTL } from "../config";
import { hashSecret, randomToken } from "../crypto";
import { recordLoginEvent } from "../events";
import { loginErrorUrl } from "./errors";
import { currentBrowserKey, startSession, touchSession } from "./session";

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

type CodeRequest = Pick<
  LoginTransaction,
  "serviceId" | "redirectUri" | "state" | "scope" | "nonce" | "codeChallenge" | "codeChallengeMethod"
>;

/** authorization code를 만들고 서비스로 돌아갈 주소를 돌려준다 */
export async function issueCode(request: CodeRequest, session: Pick<Session, "id" | "userId" | "authTime" | "method">) {
  const code = randomToken();
  await getPrisma().authorizationCode.create({
    data: {
      codeHash: await hashSecret(code),
      serviceId: request.serviceId,
      userId: session.userId,
      redirectUri: request.redirectUri,
      scope: request.scope,
      nonce: request.nonce,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      sessionId: session.id || null,
      authTime: session.authTime,
      authMethod: session.method,
      expiresAt: new Date(Date.now() + TTL.authorizationCodeMs),
    },
  });
  return clientRedirectUrl(request, { code });
}

/** 살아 있는 세션으로 로그인 화면 없이 code를 준다 (SSO) */
export async function continueWithSession(request: CodeRequest, session: Session) {
  await touchSession(session.id);
  await recordLoginEvent({ serviceId: request.serviceId, type: "login", userId: session.userId, method: "session" });
  return issueCode(request, session);
}

/**
 * 사용자가 직접 인증을 마치면 로그인 진행을 끝낸다.
 * 이 브라우저의 세션을 새로 시작하고, 서비스로 돌아갈 주소(redirect_uri?code=...)를 돌려준다.
 * 계정 화면 로그인(returnTo)이면 code 없이 그 화면으로 돌아간다.
 * 정지된 사용자면 오류 화면 주소를 돌려준다.
 */
export async function finishLogin(transaction: LoginTransaction, userId: string, method: string) {
  const prisma = getPrisma();
  // 한 번 쓰면 끝 (이미 지워졌어도 괜찮다)
  await prisma.loginTransaction.deleteMany({ where: { id: transaction.id } });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.disabledAt) {
    await recordLoginEvent({ serviceId: transaction.serviceId, type: "failure", userId, method, reason: "disabled" });
    return loginErrorUrl("user_disabled");
  }

  // 브라우저 쿠키는 /oauth/authorize에서 미리 심어 둔다 (서버 액션에서 쿠키를 바꾸면 화면이 다시 그려진다)
  const browserKey = await currentBrowserKey();
  const session = browserKey
    ? await startSession({ browserKey, serviceId: transaction.serviceId, userId, method })
    : null;

  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await recordLoginEvent({ serviceId: transaction.serviceId, type: "login", userId, email: user.email, method });

  if (transaction.returnTo) return transaction.returnTo;
  return issueCode(transaction, session ?? { id: "", userId, authTime: new Date(), method });
}
