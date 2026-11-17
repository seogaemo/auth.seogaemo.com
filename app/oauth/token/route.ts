import type { Service } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { isEmailAllowed } from "@/lib/allowlist";
import { hashSecret } from "@/lib/crypto";
import { consumeAuthorizationCode } from "@/lib/oauth/codes";
import { authenticateClient, json, oauthError, preflight, readForm } from "@/lib/oauth/http";
import { issueTokens, revokeAllRefreshTokens } from "@/lib/oauth/tokens";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** OAuth 2.0 Token Endpoint: authorization_code, refresh_token */
export async function POST(request: Request) {
  const form = await readForm(request);
  if (!form) {
    return oauthError("invalid_request", "content-type must be application/x-www-form-urlencoded");
  }

  const service = await authenticateClient(request, form);
  if (!service) return oauthError("invalid_client", "client authentication failed", 401);

  switch (form.get("grant_type")) {
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

  if (record.revokedAt) {
    // 이미 교체된 토큰이 다시 쓰였다 = 유출됐을 수 있다. 이 사용자의 토큰을 전부 끊는다.
    await revokeAllRefreshTokens(record.serviceId, record.userId);
    return oauthError("invalid_grant", "refresh token was revoked");
  }
  if (record.expiresAt < new Date()) {
    return oauthError("invalid_grant", "refresh token expired");
  }
  if (record.user.disabledAt) return oauthError("invalid_grant", "user is disabled");
  // 허용 목록이 켜지거나 바뀌어 목록 밖이 된 사용자는 더 이어 쓸 수 없다
  if (!isEmailAllowed(service, record.user.email)) {
    await revokeAllRefreshTokens(record.serviceId, record.userId);
    return oauthError("invalid_grant", "user is not allowed to sign in to this client");
  }

  const { count } = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count !== 1) {
    await revokeAllRefreshTokens(record.serviceId, record.userId);
    return oauthError("invalid_grant", "refresh token was revoked");
  }

  // scope를 줄여 달라는 요청만 허용한다
  const requested = form.get("scope")?.split(" ").filter(Boolean);
  const granted = record.scope.split(" ");
  if (requested?.some((s) => !granted.includes(s))) {
    return oauthError("invalid_scope", "scope exceeds the original grant");
  }
  const scope = requested?.length ? requested.join(" ") : record.scope;

  return json(await issueTokens({ service, user: record.user, scope, sessionId: record.sessionId }));
}
