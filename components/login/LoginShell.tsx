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

/**
 * Figma 0:632(데스크톱), 0:733(모바일).
 * 바깥 여백 16, 카드 최대 480, 테두리 8, 안쪽 여백 24(모바일 16), 블록 간격 32.
 */
export function LoginShell({
  branding = {},
  preview = false,
  children,
}: {
  branding?: Branding;
  /** 콘솔 미리보기용. 화면 전체가 아니라 상자 안에 그린다. */
  preview?: boolean;
  children: ReactNode;
}) {
  const Root = preview ? "div" : "main";
  return (
    <Root
      className={`login-grid flex flex-col items-center justify-center px-4 ${preview ? "rounded-lg py-12" : "min-h-dvh py-8"}`}
      style={brandingStyle(branding)}
    >
      <div className="flex w-full max-w-[480px] flex-col gap-8 overflow-hidden break-keep border-8 border-login-brand-strong bg-white p-4 sm:p-6">
        {children}
        <footer className="flex justify-center pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/seogaemo-wordmark.svg"
            alt="Seogaemo"
            width={125}
            height={28}
            className="h-5 w-auto sm:h-7"
          />
        </footer>
      </div>
    </Root>
  );
}
