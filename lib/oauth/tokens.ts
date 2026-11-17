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
    // Outline 등 일부 RP는 preferred_username/name 중 하나가 없으면 로그인을 거부한다.
    // 이름이 없는 사용자(이메일 로그인 등)도 있으므로 이메일 앞부분, 그다음 id로 대체한다.
    claims.preferred_username = user.name || user.email?.split("@")[0] || user.id;
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
}) {
  const { service, user, scope, nonce } = params;

  const refreshToken = randomToken();
  await getPrisma().refreshToken.create({
    data: {
      tokenHash: await hashSecret(refreshToken),
      serviceId: service.id,
      userId: user.id,
      scope,
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
