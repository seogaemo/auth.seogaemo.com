import type { Provider } from "@/lib/config";

/**
 * Figma 0:1144 ~ 0:1159: 높이 64(모바일 52), 각진 모서리, 아이콘 24 + 간격 8,
 * 왼쪽 16 / 오른쪽 32 여백, Monoplex Medium 18px(모바일 15px) 자간 -0.1em.
 */
const STYLES: Record<Provider, { label: string; icon: string; className: string }> = {
  google: {
    label: "Google로 로그인",
    icon: "/brand/google.svg",
    className: "border-2 border-login-stroke bg-white",
  },
  kakao: {
    label: "카카오로 로그인",
    icon: "/brand/kakao.svg",
    className: "border-2 border-login-stroke bg-kakao",
  },
};

export function ProviderButton({ provider, preview = false }: { provider: Provider; preview?: boolean }) {
  const { label, icon, className } = STYLES[provider];
  const Root = preview ? "span" : "a";

  return (
    <Root
      href={preview ? undefined : `/oauth/provider/${provider}/start`}
      className={`flex h-[52px] w-full items-center justify-center gap-2 pl-4 pr-8 transition-[filter] hover:brightness-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2 sm:h-16 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" width={24} height={24} className="size-5 sm:size-6" />
      <span className="font-mono text-[15px] font-[500] tracking-[-0.1em] text-[#101016] sm:text-[18px]">
        {label}
      </span>
    </Root>
  );
}
