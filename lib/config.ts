import { getCloudflareContext } from "@opennextjs/cloudflare";

/** 로그인 수단. 화면과 목록에는 이 순서로 보여준다 (DESIGN.md 5.1). */
export const PROVIDERS = ["password", "email", "google", "kakao"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** 외부 OAuth 제공자 */
export const SOCIAL_PROVIDERS = ["google", "kakao"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  password: "이메일/비밀번호",
  email: "이메일 코드",
  google: "Google",
  kakao: "카카오",
};

export const SUPPORTED_SCOPES = ["openid", "email", "profile"] as const;

export const TTL = {
  /** /oauth/authorize 부터 로그인 완료까지 */
  loginTransactionMs: 10 * 60 * 1000,
  authorizationCodeMs: 5 * 60 * 1000,
  refreshTokenMs: 30 * 24 * 60 * 60 * 1000,
  accessTokenSec: 60 * 60,
  consoleSessionSec: 7 * 24 * 60 * 60,
  emailCodeMs: 10 * 60 * 1000,
  /** 같은 이메일로 코드를 다시 보내려면 기다려야 하는 시간 */
  emailCodeCooldownMs: 30 * 1000,
} as const;

export const LIMITS = {
  /** 한 이메일에 한 시간 동안 보낼 수 있는 코드 수 */
  emailCodesPerHour: 5,
  /** 코드 하나에 틀릴 수 있는 횟수 */
  emailCodeAttempts: 5,
  /** 비밀번호를 연속으로 틀리면 잠그는 횟수와 시간 */
  passwordAttempts: 5,
  passwordLockMs: 15 * 60 * 1000,
  passwordMinLength: 8,
} as const;

export const LOGIN_TX_COOKIE = "sg_login_tx";
/** 인증 코드 입력 단계에서 어떤 코드(EmailCode.id)를 확인 중인지 */
export const EMAIL_CODE_COOKIE = "sg_email_code";

/** 콘솔 자신도 이 SSO의 서비스다 (migrations/0002_console_service.sql) */
export const CONSOLE_CLIENT_ID = "seogaemo-console";
export const CONSOLE_SESSION_COOKIE = "sg_console";
export const CONSOLE_LOGIN_COOKIE = "sg_console_login";

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
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
