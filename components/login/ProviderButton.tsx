import type { Provider } from "@/lib/config";

/** DESIGN.md 5.2. 각 제공자의 브랜드 가이드를 우선한다. */
const STYLES: Record<Provider, { label: string; icon: string; className: string }> = {
  google: {
    label: "Google로 로그인",
    icon: "/brand/google.svg",
    className: "border-2 border-login-stroke bg-white text-primary hover:bg-gray-100",
  },
  kakao: {
    label: "카카오로 로그인",
    icon: "/brand/kakao.svg",
    className: "bg-kakao text-[rgba(0,0,0,0.85)] hover:brightness-95",
  },
};

export function ProviderButton({ provider, preview = false }: { provider: Provider; preview?: boolean }) {
  const { label, icon, className } = STYLES[provider];
  const Root = preview ? "span" : "a";

  return (
    <Root
      href={preview ? undefined : `/oauth/provider/${provider}/start`}
      className={`flex h-16 w-full items-center justify-center gap-2 rounded px-4 font-mono text-[18px] font-[500] tracking-[-0.06em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" width={24} height={24} className="size-6" />
      {label}
    </Root>
  );
}
