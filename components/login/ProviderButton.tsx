import type { SocialProvider } from "@/lib/config";

/**
 * 높이 48, 각진 모서리, 2px 테두리, 아래 3px 단단한 그림자 (누르면 내려앉음).
 * 아이콘 20 + 간격 8, 모노 15px.
 */
const STYLES: Record<SocialProvider, { label: string; icon: string; className: string }> = {
  google: {
    label: "Google로 로그인",
    icon: "/brand/google.svg",
    className: "bg-white hover:bg-[#f7f7f8]",
  },
  kakao: {
    label: "카카오로 로그인",
    icon: "/brand/kakao.svg",
    className: "bg-kakao hover:brightness-[0.97]",
  },
};

const PRESS =
  "border-2 border-[rgba(0,0,0,0.12)] shadow-[0_3px_0_0_rgba(0,0,0,0.12)] transition-[transform,box-shadow,filter,background-color] duration-75 active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2";

/**
 * 이메일 입력이 있는 화면에서는 Figma 0:632처럼 48px 정사각형 아이콘으로 한 줄에 둔다.
 * 이름은 aria-label과 title로 알린다.
 */
export function ProviderIconButton({ provider, preview = false }: { provider: SocialProvider; preview?: boolean }) {
  const { label, icon, className } = STYLES[provider];
  const Root = preview ? "span" : "a";

  return (
    <Root
      href={preview ? undefined : `/oauth/provider/${provider}/start`}
      aria-label={preview ? undefined : label}
      title={label}
      className={`flex size-12 items-center justify-center ${PRESS} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" width={20} height={20} className="size-5" />
    </Root>
  );
}

export function ProviderButton({ provider, preview = false }: { provider: SocialProvider; preview?: boolean }) {
  const { label, icon, className } = STYLES[provider];
  const Root = preview ? "span" : "a";

  return (
    <Root
      href={preview ? undefined : `/oauth/provider/${provider}/start`}
      className={`flex h-12 w-full items-center justify-center gap-2 border-2 border-[rgba(0,0,0,0.12)] pr-2 shadow-[0_3px_0_0_rgba(0,0,0,0.12)] transition-[transform,box-shadow,filter,background-color] duration-75 active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" width={20} height={20} className="size-5" />
      <span className="font-mono text-[15px] font-[500] tracking-[-0.06em] text-[#101016]">{label}</span>
    </Root>
  );
}
