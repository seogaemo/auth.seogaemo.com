import { OAuthError, ValidationError } from "./errors.js";
import type { FetchOptions, ServerMetadata } from "./metadata.js";

export interface UserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
  [key: string]: unknown;
}

/**
 * UserInfo (OIDC Core 5.3). Bearer 헤더로 보낸다 (RFC 6750 2.1).
 * expectedSub를 넘기면 ID 토큰의 sub와 같은지 확인한다 (5.3.2, 토큰 바꿔치기 방지).
 */
export async function fetchUserInfo(
  metadata: Pick<ServerMetadata, "userinfo_endpoint">,
  accessToken: string,
  options: FetchOptions & { expectedSub?: string } = {},
): Promise<UserInfo> {
  if (!metadata.userinfo_endpoint) throw new TypeError("server has no userinfo_endpoint");
  const response = await (options.fetch ?? fetch)(metadata.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) {
    // RFC 6750 3: 오류는 WWW-Authenticate 헤더에 온다
    const challenge = response.headers.get("www-authenticate") ?? "";
    const error = /error="([^"]+)"/.exec(challenge)?.[1] ?? (response.status === 401 ? "invalid_token" : "server_error");
    const description = /error_description="([^"]+)"/.exec(challenge)?.[1];
    throw new OAuthError(error, description, response.status);
  }
  const info = (await response.json()) as UserInfo;
  if (typeof info.sub !== "string") throw new ValidationError("invalid_response", "userinfo has no sub");
  if (options.expectedSub !== undefined && info.sub !== options.expectedSub) {
    throw new ValidationError("invalid_response", "userinfo sub does not match the ID token");
  }
  return info;
}
