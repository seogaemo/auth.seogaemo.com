import type { Service, User } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { TTL } from "../config";
import { hashSecret, randomToken } from "../crypto";
import { signAccessToken, signIdToken } from "../token";

function hasScope(scope: string, value: string) {
  return scope.split(" ").includes(value);
}

/** scope에 따라 userinfo, id_token에 넣을 사용자 정보 */
export function userClaims(user: User, scope: string) {
  const claims: Record<string, unknown> = { sub: user.id };

  if (hasScope(scope, "email") && user.email) {
    claims.email = user.email;
    // 검증된 이메일일 때만 User.email을 채운다 (lib/oauth/users.ts)
    claims.email_verified = true;
  }
  if (hasScope(scope, "profile")) {
    if (user.name) claims.name = user.name;
    if (user.image) claims.picture = user.image;
  }

  return claims;
}

/** access_token, (openid면) id_token, refresh_token을 발급한다 */
export async function issueTokens(params: {
  service: Service;
  user: User;
  scope: string;
  nonce?: string | null;
  /** 이 토큰을 만든 로그인 세션. 로그아웃하면 refresh token이 같이 끊긴다. */
  sessionId?: string | null;
  /** 마지막 직접 인증 시각 (id_token auth_time) */
  authTime?: Date | null;
}) {
  const { service, user, scope, nonce, sessionId, authTime } = params;

  const refreshToken = randomToken();
  await getPrisma().refreshToken.create({
    data: {
      tokenHash: await hashSecret(refreshToken),
      serviceId: service.id,
      userId: user.id,
      scope,
      sessionId: sessionId ?? null,
      expiresAt: new Date(Date.now() + TTL.refreshTokenMs),
    },
  });

  const accessToken = await signAccessToken({
    sub: user.id,
    aud: service.clientId,
    client_id: service.clientId,
    scope,
  });

  const idToken = hasScope(scope, "openid")
    ? await signIdToken({
        ...userClaims(user, scope),
        sub: user.id,
        aud: service.clientId,
        ...(nonce ? { nonce } : {}),
        ...(sessionId ? { sid: sessionId } : {}),
        ...(authTime ? { auth_time: Math.floor(authTime.getTime() / 1000) } : {}),
      })
    : undefined;

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TTL.accessTokenSec,
    refresh_token: refreshToken,
    scope,
    ...(idToken ? { id_token: idToken } : {}),
  };
}

/** 이 사용자가 이 서비스에서 받은 refresh token을 전부 폐기한다 */
export async function revokeAllRefreshTokens(serviceId: string, userId: string) {
  await getPrisma().refreshToken.updateMany({
    where: { serviceId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
