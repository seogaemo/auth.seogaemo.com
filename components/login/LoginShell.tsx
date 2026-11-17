import type { CSSProperties, ReactNode } from "react";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export interface Branding {
  brandColor?: string | null;
  brandBackground?: string | null;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 브랜드 색 위 글자색. 시안은 흰 글자라 흰색이 4.5:1을 넘으면 흰색,
 * 아니면 검정이 4.5:1을 넘을 때 검정 (노랑, 연두 같은 밝은 브랜드 색),
 * 둘 다 못 넘으면 대비가 큰 쪽.
 */
export function onBrandColor(brand: string) {
  const L = luminance(brand);
  const white = 1.05 / (L + 0.05);
  const black = (L + 0.05) / (luminance("#101016") + 0.05);
  if (white >= 4.5) return "#ffffff";
  if (black >= 4.5) return "#101016";
  return white >= black ? "#ffffff" : "#101016";
}

/**
 * 흰 카드 위 링크 글자는 --login-brand-strong(브랜드 80% + 검정)을 쓴다.
 * 밝은 브랜드 색이라 흰 바탕과 4.5:1이 안 되면 검정으로 바꾼다.
 */
function brandTextOnWhite(brand: string) {
  const strong = "#" + [1, 3, 5].map((i) => Math.round(parseInt(brand.slice(i, i + 2), 16) * 0.8).toString(16).padStart(2, "0")).join("");
  return 1.05 / (luminance(strong) + 0.05) >= 4.5 ? null : "#101016";
}

/** 서비스 브랜딩 값을 CSS 변수로. 값은 #rrggbb만 받는다 (CSS 주입 방지). */
function brandingStyle({ brandColor, brandBackground }: Branding): CSSProperties {
  const style: Record<string, string> = {};
  if (brandColor && HEX_COLOR.test(brandColor)) {
    style["--login-brand"] = brandColor;
    style["--login-on-brand"] = onBrandColor(brandColor);
    const text = brandTextOnWhite(brandColor);
    if (text) style["--login-brand-text"] = text;
  }
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
      <div className="flex w-full max-w-[400px] flex-col gap-7 break-keep border-[6px] [overflow-wrap:anywhere] border-login-brand-strong bg-white p-5 shadow-[8px_8px_0_0_rgba(0,0,0,0.18)] sm:p-7">
        {children}
        <footer className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/seogaemo-wordmark.svg" alt="Seogaemo" width={80} height={18} className="h-[18px] w-auto" />
        </footer>
      </div>
    </Root>
  );
}
