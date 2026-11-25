import type { RefreshToken, Service } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { isEmailAllowed } from "@/lib/allowlist";
import { hashSecret } from "@/lib/crypto";
import { consumeAuthorizationCode } from "@/lib/oauth/codes";
import { authenticateClient, json, oauthError, preflight, readForm, repeatedParam } from "@/lib/oauth/http";
import { issueTokens, revokeAllRefreshTokens } from "@/lib/oauth/tokens";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** OAuth 2.0 Token Endpoint: authorization_code, refresh_token */
export async function POST(request: Request) {
  const form = await readForm(request);
  if (!form) {
    return oauthError("invalid_request", "content-type must be application/x-www-form-urlencoded");
  }

  const repeated = repeatedParam(form);
  if (repeated) return oauthError("invalid_request", `${repeated} must not be repeated`);

  const service = await authenticateClient(request, form);
  if (!service) return oauthError("invalid_client", "client authentication failed", 401);

  switch (form.get("grant_type")) {
    case null:
      return oauthError("invalid_request", "grant_type is required");
    case "authorization_code":
      return exchangeAuthorizationCode(service, form);
    case "refresh_token":
      return rotateRefreshToken(service, form);
    default:
      return oauthError("unsupported_grant_type", "grant_type is not supported");
  }
}

async function exchangeAuthorizationCode(service: Service, form: URLSearchParams) {
  const code = form.get("code");
  const redirectUri = form.get("redirect_uri");
  const codeVerifier = form.get("code_verifier");
  if (!code || !redirectUri || !codeVerifier) {
    return oauthError("invalid_request", "code, redirect_uri and code_verifier are required");
  }

  const result = await consumeAuthorizationCode(service, { code, redirectUri, codeVerifier });
  if (!result.ok) return oauthError(result.error, result.description);

  const { record } = result;
  if (record.user.disabledAt) return oauthError("invalid_grant", "user is disabled");
  return json(
    await issueTokens({
      service,
      user: record.user,
      scope: record.scope,
      nonce: record.nonce,
      sessionId: record.sessionId,
      authTime: record.authTime,
      authMethod: record.authMethod,
    }),
  );
}

async function rotateRefreshToken(service: Service, form: URLSearchParams) {
  const token = form.get("refresh_token");
  if (!token) return oauthError("invalid_request", "refresh_token is required");

  const prisma = getPrisma();
  const tokenHash = await hashSecret(token);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.serviceId !== service.id) {
    return oauthError("invalid_grant", "invalid refresh token");
  }

  // 방금 교체된 토큰이면 유예 시간 안에서는 새 토큰을 한 번 더 준다 (동시 갱신). 그 밖의 재사용은 유출로 본다
  const inGrace = record.revokedAt ? await withinGrace(service, record) : false;
  if (record.revokedAt && !inGrace) {
    // 이미 교체되거나 끊긴 토큰이 다시 쓰였다 = 유출됐을 수 있다. 이 사용자의 토큰을 전부 끊는다.
    await revokeAllRefreshTokens(record.serviceId, record.userId);
    return oauthError("invalid_grant", "refresh token was revoked");
  }
  if (record.expiresAt < new Date()) {
    return oauthError("invalid_grant", "refresh token expired");
  }
  if (record.user.disabledAt) return oauthError("invalid_grant", "user is disabled");

  // scope를 줄여 달라는 요청만 허용한다. 거절할 때 토큰을 소모하면 잘못된 요청 한 번에 로그인이 끊기므로 회전 전에 본다
  const requested = form.get("scope")?.split(" ").filter(Boolean);
  const granted = record.scope.split(" ");
  if (requested?.some((s) => !granted.includes(s))) {
    return oauthError("invalid_scope", "scope exceeds the original grant");
  }
  const scope = requested?.length ? requested.join(" ") : record.scope;

  // 허용 목록이 켜지거나 바뀌어 목록 밖이 된 사용자는 더 이어 쓸 수 없다
  if (!isEmailAllowed(service, record.user.email)) {
    await revokeAllRefreshTokens(record.serviceId, record.userId);
    return oauthError("invalid_grant", "user is not allowed to sign in to this client");
  }

  if (!inGrace) {
    const now = new Date();
    const { count } = await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });
    // 같은 토큰으로 거의 동시에 온 요청 중 늦은 쪽. 방금 다른 요청이 교체했으면 유예 시간 규칙을 따른다
    if (count !== 1) {
      const latest = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (!latest || !isFreshRotation(service, latest)) {
        await revokeAllRefreshTokens(record.serviceId, record.userId);
        return oauthError("invalid_grant", "refresh token was revoked");
      }
    }
  }

  // 새 ID 토큰의 auth_time은 처음 인증 시각 그대로, nonce는 넣지 않는다 (OIDC Core 12.2)
  return json(
    await issueTokens({
      service,
      user: record.user,
      scope,
      sessionId: record.sessionId,
      authTime: record.authTime,
      authMethod: record.authMethod,
    }),
  );
}

/** 갱신으로 교체된 지 유예 시간 안인지 */
function isFreshRotation(service: Service, token: RefreshToken) {
  const grace = Math.min(Math.max(service.refreshTokenGraceSec, 0), 60) * 1000;
  return grace > 0 && token.rotatedAt !== null && Date.now() - token.rotatedAt.getTime() <= grace;
}

/**
 * 교체된 토큰을 유예 시간 안에 다시 쓴 경우. 그 사이 로그아웃이나 폐기로 로그인이 끊겼으면(이어진 토큰이 모두 끊김)
 * 유예하지 않는다. 교체 뒤 만들어진, 같은 로그인 세션의 살아 있는 토큰이 하나라도 있어야 한다.
 */
async function withinGrace(service: Service, token: RefreshToken) {
  if (!isFreshRotation(service, token)) return false;
  const live = await getPrisma().refreshToken.count({
    where: {
      serviceId: token.serviceId,
      userId: token.userId,
      sessionId: token.sessionId,
      revokedAt: null,
      createdAt: { gte: token.rotatedAt! },
    },
  });
  return live > 0;
}
