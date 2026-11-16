import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * 로그인 화면 폼 요소 (Figma 0:632 스타일, 크기는 DESIGN.md 3.5).
 * 각진 모서리, 2px 테두리, 모노 폰트. 버튼은 아래로 3px 단단한 그림자, 누르면 내려앉는다.
 */

const ring =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2";

export function LoginField({
  label,
  id,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[13px] font-[500] tracking-[-0.04em] text-quaternary">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
        className={`h-12 w-full border-2 border-[rgba(0,0,0,0.12)] bg-white px-3 font-mono text-[15px] tracking-[-0.02em] text-[#101016] placeholder:text-unselected focus:border-login-brand focus:outline-none ${input.className ?? ""}`}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-label text-quaternary">
          {hint}
        </p>
      )}
    </div>
  );
}

const BUTTON = {
  primary:
    "border-[rgba(0,0,0,0.2)] bg-login-brand text-white shadow-[0_3px_0_0_var(--login-brand-strong)] hover:brightness-105",
  secondary:
    "border-[rgba(0,0,0,0.12)] bg-white text-[#101016] shadow-[0_3px_0_0_rgba(0,0,0,0.12)] hover:bg-[#f7f7f8]",
};

export function LoginButton({
  variant = "primary",
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; icon?: string }) {
  return (
    <button
      {...props}
      className={`flex h-12 w-full items-center justify-center gap-2 border-2 transition-[transform,box-shadow,filter,background-color] duration-75 active:translate-y-[3px] active:shadow-none disabled:pointer-events-none disabled:opacity-60 ${BUTTON[variant]} ${ring}`}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" width={20} height={20} className="size-5" />
      )}
      <span className={`font-mono text-[15px] font-[600] tracking-[-0.06em] ${variant === "primary" ? "text-white" : "text-[#101016]"}`}>
        {children}
      </span>
    </button>
  );
}

export function LoginLinkButton({ href, icon, children }: { href: string; icon?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex h-12 w-full items-center justify-center gap-2 border-2 border-[rgba(0,0,0,0.12)] bg-white pr-2 shadow-[0_3px_0_0_rgba(0,0,0,0.12)] transition-[transform,box-shadow,background-color] duration-75 hover:bg-[#f7f7f8] active:translate-y-[3px] active:shadow-none ${ring}`}
    >
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" width={20} height={20} className="size-5" />
      )}
      <span className="font-mono text-[15px] font-[500] tracking-[-0.06em] text-[#101016]">{children}</span>
    </Link>
  );
}

/** 브랜드 색 밑줄 링크 (Figma "비밀번호를 잊으셨나요? →") */
export function LoginTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-sm font-mono text-[13px] font-[500] tracking-[-0.04em] text-login-brand-strong underline decoration-1 underline-offset-[3px] hover:text-login-brand ${ring}`}
    >
      {children}
    </Link>
  );
}

/**
 * 오류 알림 영역. 글자가 없을 때도 영역을 먼저 그려 둬야 스크린 리더가 바뀐 글자를 읽는다.
 * 폼(gap-3)의 첫 자식으로 두고, 비어 있을 땐 아래 간격을 없앤다.
 */
export function LoginError({ children }: { children?: ReactNode }) {
  return (
    <div role="alert" className={children ? "" : "-mb-3"}>
      {children && (
        <p className="border-l-4 border-[#ff3b30] bg-[#fff1f0] px-3 py-2 text-footnote text-[#b2231a]">{children}</p>
      )}
    </div>
  );
}

/** "또는" 구분선 */
export function LoginDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-[rgba(0,0,0,0.1)]" />
      <span className="font-mono text-[12px] tracking-[-0.04em] text-unselected">또는</span>
      <span className="h-px flex-1 bg-[rgba(0,0,0,0.1)]" />
    </div>
  );
}
