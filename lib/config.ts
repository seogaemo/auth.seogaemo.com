import { getCloudflareContext } from "@opennextjs/cloudflare";

export const PROVIDERS = ["google", "kakao"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const SUPPORTED_SCOPES = ["openid", "email", "profile"] as const;

export const TTL = {
  /** /oauth/authorize 부터 로그인 완료까지 */
  loginTransactionMs: 10 * 60 * 1000,
  authorizationCodeMs: 5 * 60 * 1000,
  refreshTokenMs: 30 * 24 * 60 * 60 * 1000,
  accessTokenSec: 60 * 60,
} as const;

export const LOGIN_TX_COOKIE = "sg_login_tx";

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** OIDC issuer. 모든 엔드포인트 주소의 기준이기도 하다. */
export function getIssuer() {
  const issuer = getCloudflareContext().env.ISSUER;
  if (!issuer) throw new Error("ISSUER is not set");
  return issuer.replace(/\/+$/, "");
}

export function endpoint(path: string) {
  return `${getIssuer()}${path}`;
}
