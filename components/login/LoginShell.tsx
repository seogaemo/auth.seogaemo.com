import type { CSSProperties, ReactNode } from "react";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface Branding {
  brandColor?: string | null;
  brandBackground?: string | null;
}

/** 서비스 브랜딩 값을 CSS 변수로. 값은 #rrggbb만 받는다 (CSS 주입 방지). */
function brandingStyle({ brandColor, brandBackground }: Branding): CSSProperties {
  const style: Record<string, string> = {};
  if (brandColor && HEX_COLOR.test(brandColor)) style["--login-brand"] = brandColor;
  if (brandBackground && HEX_COLOR.test(brandBackground)) {
    style["--login-background"] = brandBackground;
  }
  return style as CSSProperties;
}

/** 브랜드 색 그리드 배경 + 가운데 카드 (DESIGN.md 4.1) */
export function LoginShell({ branding = {}, children }: { branding?: Branding; children: ReactNode }) {
  return (
    <main
      className="login-grid flex min-h-dvh items-center justify-center px-4 py-12"
      style={brandingStyle(branding)}
    >
      <div className="flex w-full max-w-[480px] flex-col gap-8 break-keep border-8 border-login-brand-strong bg-white p-6">
        {children}
        <footer className="flex justify-center pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/seogaemo-wordmark.svg" alt="Seogaemo" width={107} height={24} />
        </footer>
      </div>
    </main>
  );
}
