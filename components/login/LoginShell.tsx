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
 * 패턴 배경 + 굵은 테두리 카드 (Figma 0:632의 스타일, 크기는 실제 화면 기준으로 줄임).
 * 카드 400, 테두리 6, 안쪽 28(모바일 20), 뒤에 깔린 단단한 그림자로 입체감을 준다.
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
      className={`login-grid flex flex-col items-center justify-center px-4 ${preview ? "rounded-lg py-10" : "min-h-dvh py-10"}`}
      style={brandingStyle(branding)}
    >
      <div className="flex w-full max-w-[400px] flex-col gap-7 break-keep border-[6px] border-login-brand-strong bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,0.18)] sm:p-7">
        {children}
        <footer className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/seogaemo-wordmark.svg" alt="Seogaemo" width={80} height={18} className="h-[18px] w-auto" />
        </footer>
      </div>
    </Root>
  );
}
