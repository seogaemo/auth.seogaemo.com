/**
 * 로그인 수단 목록. 이름, 아이콘, 버튼 모양을 여기 한 곳에서 정한다.
 * 새 수단을 붙이는 순서는 README "로그인 수단 추가하기"를 따른다.
 *
 * 이 파일은 브라우저 코드와 scripts/check-providers.mts도 읽는다. 다른 모듈을 import하지 않는다.
 */

export interface SocialButtonMeta {
  /** 넓은 버튼과 아이콘 버튼의 접근 이름 */
  loginLabel: string;
  /** 로그인 버튼 로고 (public 기준 경로) */
  logo: string;
  /** 로그인 버튼 배경 (Tailwind 클래스, tailwind.config의 content에 lib가 들어 있다) */
  buttonClass: string;
}

export interface ProviderMeta {
  /** 콘솔에 보이는 짧은 이름 */
  label: string;
  /** 콘솔 상태 아이콘. public/icons/{icon}-on.svg, {icon}-off.svg가 있어야 한다 */
  icon: string;
  /** 외부 OAuth 제공자면 로그인 버튼 정보. 없으면 이메일 계열 */
  social?: SocialButtonMeta;
}

/** 키 순서가 화면과 목록에 보이는 순서다 (DESIGN.md 5.1) */
export const PROVIDER_META = {
  password: { label: "이메일/비밀번호", icon: "password" },
  email: { label: "이메일 코드", icon: "email" },
  google: {
    label: "Google",
    icon: "google",
    social: {
      loginLabel: "Google로 로그인",
      logo: "/brand/google.svg",
      buttonClass: "bg-white hover:bg-[#f7f7f8]",
    },
  },
  kakao: {
    label: "카카오",
    icon: "kakao",
    social: {
      loginLabel: "카카오로 로그인",
      logo: "/brand/kakao.svg",
      buttonClass: "bg-kakao hover:brightness-[0.97]",
    },
  },
} as const satisfies Record<string, ProviderMeta>;

type Meta = typeof PROVIDER_META;
export type Provider = keyof Meta;
export type SocialProvider = {
  [K in Provider]: Meta[K] extends { social: SocialButtonMeta } ? K : never;
}[Provider];

export const PROVIDERS = Object.keys(PROVIDER_META) as Provider[];

export const SOCIAL_PROVIDERS = PROVIDERS.filter(
  (provider) => "social" in PROVIDER_META[provider],
) as SocialProvider[];

export const PROVIDER_LABELS = Object.fromEntries(
  PROVIDERS.map((provider) => [provider, PROVIDER_META[provider].label]),
) as Record<Provider, string>;

/**
 * 로그인 기록, 세션, 연결된 수단(Identity)에 남는 방식. 콘솔에서 고르는 Provider에 패스키를 더한 것이다.
 * 패스키는 서비스마다 켜고 끄지 않고, 이메일/비밀번호/이메일 코드가 켜져 있으면 같이 켜진다 (lib/passkey.ts).
 */
export type LoginMethod = Provider | "passkey";

export const LOGIN_METHOD_LABELS: Record<LoginMethod, string> = { ...PROVIDER_LABELS, passkey: "패스키" };

export function isLoginMethod(value: string): value is LoginMethod {
  return value === "passkey" || (PROVIDERS as string[]).includes(value);
}

export function socialMeta(provider: SocialProvider): SocialButtonMeta {
  return PROVIDER_META[provider].social;
}

export function providerIcon(provider: Provider, on: boolean) {
  return `/icons/${PROVIDER_META[provider].icon}-${on ? "on" : "off"}.svg`;
}
