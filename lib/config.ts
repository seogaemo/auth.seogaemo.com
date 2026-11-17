import { getCloudflareContext } from "@opennextjs/cloudflare";

import { PROVIDERS, SOCIAL_PROVIDERS, type Provider, type SocialProvider } from "./provider-meta";

/** 로그인 수단 목록과 이름, 아이콘은 provider-meta.ts 한 곳에서 정한다 */
export {
  PROVIDER_LABELS,
  PROVIDERS,
  SOCIAL_PROVIDERS,
  providerIcon,
  socialMeta,
  type Provider,
  type SocialProvider,
} from "./provider-meta";

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
  /** 로그인 유지 기간. 이 안에는 /oauth/authorize가 로그인 화면 없이 넘어간다. 늘리지 않는다. */
  sessionMs: 30 * 24 * 60 * 60 * 1000,
  /** 브라우저 식별 쿠키. 세션 자체는 DB에 있고 만료도 DB 기준이다. */
  browserCookieSec: 400 * 24 * 60 * 60,
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
/** 첫 단계에서 입력한 이메일. 비밀번호, 가입, 재설정 단계가 이어 받는다 */
export const LOGIN_EMAIL_COOKIE = "sg_login_email";
/** 브라우저 식별 값 (랜덤). DB에는 해시만 두고, 서비스마다 Session을 찾는 열쇠로 쓴다. */
export const BROWSER_COOKIE = "sg_browser";

/** OIDC prompt 값 중 지원하는 것 */
export const SUPPORTED_PROMPTS = ["none", "login", "select_account", "consent"] as const;

/** 콘솔 자신도 이 SSO의 서비스다 (migrations/0002_console_service.sql) */
export const CONSOLE_CLIENT_ID = "seogaemo-console";
export const CONSOLE_SESSION_COOKIE = "sg_console";
export const CONSOLE_LOGIN_COOKIE = "sg_console_login";

export function isProvider(value: string): value is Provider {
  return (PROVIDERS as string[]).includes(value);
}

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as string[]).includes(value);
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
