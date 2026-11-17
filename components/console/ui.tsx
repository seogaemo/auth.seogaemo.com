import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

/**
 * 콘솔 공통 컴포넌트. 수치는 Figma 시안(Wireframe 13:195, 28:927 / Page 1 0:891, 0:1072)을 따른다.
 * 색, 글자는 DS 토큰. 글자색은 상속되지 않으니 글자를 가진 요소에 직접 준다 (DESIGN.md 3.1).
 */

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] focus-visible:ring-offset-2";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "md" | "lg";

/**
 * primary는 Seogaemo 시그니처 입체 버튼: 3px 반투명 테두리 + 아래 그림자, 누르면 내려앉는다.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "border-2 border-[rgba(0,0,0,0.2)] bg-[#2c73f4] text-white shadow-[0_3px_0_0_#2551a2] hover:bg-[#2667dc] active:translate-y-[3px] active:shadow-none",
  secondary:
    "border border-base bg-base-elevated text-primary shadow-[0_2px_0_0_var(--border-base)] hover:bg-base active:translate-y-[2px] active:shadow-none",
  danger:
    "border-2 border-[rgba(0,0,0,0.2)] bg-[#ff3b30] text-white shadow-[0_3px_0_0_#b2231a] hover:bg-[#e8362c] active:translate-y-[3px] active:shadow-none",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-footnote",
  lg: "h-11 px-5 text-body",
};

function buttonClass(variant: ButtonVariant, size: ButtonSize, extra = "") {
  return `inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-strong transition-[background-color,transform,box-shadow] duration-75 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${focusRing} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  href,
  size = "md",
  children,
}: {
  href: string;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClass("primary", size)}>
      {children}
    </Link>
  );
}

/** 파란 글자 + > 아이콘 ("사진 변경하기 >", "복사") */
export function TextAction({
  children,
  tone = "accent",
  arrow = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "accent" | "negative"; arrow?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center gap-1 rounded text-label font-strong hover:underline ${
        tone === "accent" ? "text-content-accent" : "text-content-negative"
      } ${focusRing} ${props.className ?? ""}`}
    >
      {children}
      {arrow && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/icons/arrow_forward.svg" alt="" width={16} height={16} />
      )}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-lg border border-base bg-base-elevated px-3 text-footnote text-primary placeholder:text-unselected ${focusRing} ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-base bg-base-elevated px-3 py-2.5 font-mono text-footnote text-primary placeholder:text-unselected ${focusRing} ${props.className ?? ""}`}
    />
  );
}

/** 왼쪽 라벨(96px) + 오른쪽 입력, 간격 8px (Page 1 로그인 설정) */
export function FormRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
      <label
        htmlFor={htmlFor}
        className="shrink-0 text-footnote text-tertiary sm:w-28 sm:pt-[10px]"
      >
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {children}
        {hint && <p className="text-label text-quaternary">{hint}</p>}
      </div>
    </div>
  );
}

/** 콘텐츠 영역. 기본 640px, wide면 넓게 (미리보기가 있는 화면) */
export function Page({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className={`mx-auto flex w-full flex-col gap-8 pb-16 ${wide ? "max-w-[1080px]" : "max-w-[680px]"}`}>
      {children}
    </div>
  );
}

/** 뒤로가기(20px 화살표 + body tertiary). 없으면 같은 높이를 비워 둔다. */
export function BackLink({ href, label }: { href?: string; label?: string }) {
  if (!href) return null;
  return (
    <Link href={href} className={`flex w-fit items-center rounded ${focusRing}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/arrow_back.svg" alt="" width={16} height={16} />
      <span className="text-footnote text-tertiary hover:text-primary">{label}</span>
    </Link>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-headline font-strong text-primary">{children}</h1>
      {action}
    </div>
  );
}

/** 블록 제목 + 내용. 블록 사이 24px, 제목과 내용 사이 8px */
export function Block({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      {title && (
        <div className="flex flex-col gap-0.5 pb-1">
          <h2 className="text-title font-strong text-primary">{title}</h2>
          {description && <p className="text-footnote text-tertiary">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 테두리 카드 한 줄: 라벨 160px + 값 (Wireframe 28:1036) */
export function InfoRow({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 flex-col gap-1 rounded-lg border border-base bg-base-elevated px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <span className="shrink-0 text-footnote text-tertiary sm:w-28">{label}</span>
      <div className="min-w-0 flex-1 text-footnote text-primary">{children}</div>
      {action}
    </div>
  );
}

/**
 * 선택 칩의 체크 표시. 바로 앞 형제 input에 peer 클래스가 있어야 한다.
 * 선택 상태를 테두리 색만으로 알리지 않도록 모양으로도 보여준다 (WCAG 1.4.1).
 */
export function CheckMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={16}
      height={16}
      className="hidden shrink-0 text-content-accent peer-checked:block"
    >
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 폼을 담는 테두리 카드 */
export function Card({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "danger" }) {
  return (
    <div
      className={`flex flex-col gap-5 rounded-lg border p-5 ${
        tone === "danger" ? "border-red-100 bg-base-elevated" : "border-base bg-base-elevated"
      }`}
    >
      {children}
    </div>
  );
}

export function Notice({ tone, children }: { tone: "positive" | "negative" | "warning"; children: ReactNode }) {
  const style = {
    positive: "bg-positive-elevated",
    negative: "bg-negative-elevated",
    warning: "bg-warning-elevated",
  }[tone];
  return <p className={`rounded-lg px-4 py-3 text-footnote text-primary ${style}`}>{children}</p>;
}

/**
 * 폼 결과 알림. 스크린 리더가 바뀐 글자를 읽도록 알림 영역을 비어 있을 때부터 그려 둔다.
 * gap-4 세로 목록의 첫 자식으로 두고, 비어 있으면 아래 간격을 없앤다.
 * key로 다시 그려지는 폼 안에 두면 영역도 새로 생겨서 읽히지 않으니 폼 바깥에 둔다.
 */
export function FormFeedback({ error, message }: { error?: string | null; message?: string | null }) {
  return (
    <>
      <div role="alert" className={error ? "" : "-mb-4"}>
        {error && <Notice tone="negative">{error}</Notice>}
      </div>
      <div role="status" className={message ? "" : "-mb-4"}>
        {message && <Notice tone="positive">{message}</Notice>}
      </div>
    </>
  );
}
