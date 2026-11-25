import type { Service, User } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { TTL } from "../config";
import { hashSecret, randomToken } from "../crypto";
import { signAccessToken, signIdToken } from "../token";
import { amrFor } from "./amr";

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
  /** 이 토큰을 만든 로그인 세션. 로그아웃하면 refresh token이 같이 끊긴다. */
  sessionId?: string | null;
  /** 마지막 직접 인증 시각 (id_token auth_time). refresh token에도 남겨 갱신 때 그대로 쓴다 */
  authTime?: Date | null;
  /** 직접 인증한 수단 (amr). refresh token에도 남겨 갱신 때 그대로 쓴다 */
  authMethod?: string | null;
  /** 회전으로 이어진 토큰 묶음. code 교환 때 정하고 갱신 때 이어 받는다 */
  familyId: string;
}) {
  const { service, user, scope, nonce, sessionId, authTime, authMethod, familyId } = params;
  // 앱 서버가 "방금 다시 로그인했는지", "어떤 수단으로 들어왔는지"를 access token만 보고 판단할 수 있게 둘 다 넣는다 (RFC 9068 2.2.1)
  const authClaims = {
    ...(authTime ? { auth_time: Math.floor(authTime.getTime() / 1000) } : {}),
    ...(amrFor(authMethod) ? { amr: amrFor(authMethod) } : {}),
  };

  const refreshToken = randomToken();
  await getPrisma().refreshToken.create({
    data: {
      tokenHash: await hashSecret(refreshToken),
      serviceId: service.id,
      userId: user.id,
      scope,
      sessionId: sessionId ?? null,
      authTime: authTime ?? null,
      authMethod: authMethod ?? null,
      familyId,
      expiresAt: new Date(Date.now() + TTL.refreshTokenMs),
    },
  });

  const accessToken = await signAccessToken({
    sub: user.id,
    aud: service.clientId,
    client_id: service.clientId,
    scope,
    ...authClaims,
  });

  const idToken = hasScope(scope, "openid")
    ? await signIdToken({
        ...userClaims(user, scope),
        sub: user.id,
        aud: service.clientId,
        ...(nonce ? { nonce } : {}),
        ...(sessionId ? { sid: sessionId } : {}),
        ...authClaims,
      }, service.idTokenSigningAlg === "RS256" ? "RS256" : "ES256")
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

/** 한 로그인에서 회전으로 이어진 refresh token을 끊는다 (재사용 감지). 같은 사용자의 다른 기기 로그인은 그대로 둔다 */
export async function revokeRefreshTokenFamily(familyId: string) {
  await getPrisma().refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 이 사용자가 이 서비스에서 받은 refresh token을 전부 폐기한다 */
export async function revokeAllRefreshTokens(serviceId: string, userId: string) {
  await getPrisma().refreshToken.updateMany({
    where: { serviceId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
