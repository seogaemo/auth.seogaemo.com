import type { AuthorizationCode, Service, User } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { hashSecret, verifyPkce } from "../crypto";
import { revokeRefreshTokenFamily } from "./tokens";

export type CodeExchangeResult =
  | { ok: true; record: AuthorizationCode & { user: User } }
  | { ok: false; error: string; description: string };

/**
 * authorization code를 검증하고 사용 처리한다. 토큰 엔드포인트와 콘솔 로그인이 같이 쓴다.
 * 성공하면 그 code는 다시 쓸 수 없다.
 */
export async function consumeAuthorizationCode(
  service: Service,
  params: { code: string; redirectUri: string; codeVerifier: string },
): Promise<CodeExchangeResult> {
  const fail = (description: string): CodeExchangeResult => ({
    ok: false,
    error: "invalid_grant",
    description,
  });

  const prisma = getPrisma();
  const codeHash = await hashSecret(params.code);
  const record = await prisma.authorizationCode.findUnique({
    where: { codeHash },
    include: { user: true },
  });

  if (!record || record.serviceId !== service.id) return fail("invalid authorization code");

  if (record.usedAt) {
    // 같은 code가 두 번 쓰였다면 탈취를 의심하고, 그 code로 발급한 토큰을 끊는다 (RFC 6749 4.1.2)
    if (record.familyId) await revokeRefreshTokenFamily(record.familyId);
    return fail("authorization code was already used");
  }
  if (record.expiresAt < new Date()) return fail("authorization code expired");
  if (record.redirectUri !== params.redirectUri) return fail("redirect_uri does not match");
  if (!(await verifyPkce(params.codeVerifier, record.codeChallenge))) {
    return fail("code_verifier does not match");
  }

  // 동시에 두 요청이 들어와도 하나만 성공하게 조건부로 표시한다
  // 이 로그인에서 나올 refresh token 묶음의 id도 같이 정한다
  const familyId = crypto.randomUUID();
  const { count } = await prisma.authorizationCode.updateMany({
    where: { codeHash, usedAt: null },
    data: { usedAt: new Date(), familyId },
  });
  if (count !== 1) return fail("authorization code was already used");

  return { ok: true, record: { ...record, familyId } };
}
