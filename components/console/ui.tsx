import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/** 콘솔 공통 컴포넌트. DS 토큰만 쓴다 (DESIGN.md 6). */

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] focus-visible:ring-offset-2";

type ButtonVariant = "primary" | "secondary" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-pressed",
  secondary: "bg-base text-primary hover:bg-base-pressed",
  danger: "bg-negative-elevated text-content-negative hover:bg-negative-elevated-pressed",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex h-12 items-center justify-center rounded-lg px-5 text-body font-strong transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${focusRing} ${className}`}
    />
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center justify-center rounded-lg bg-accent px-5 text-body font-strong text-white transition hover:bg-accent-pressed ${focusRing}`}
    >
      {children}
    </Link>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-12 w-full rounded-lg border border-base bg-base-elevated px-3 text-body text-primary placeholder:text-unselected ${focusRing} ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-base bg-base-elevated px-3 py-3 font-mono text-footnote text-primary placeholder:text-unselected ${focusRing} ${props.className ?? ""}`}
    />
  );
}

/** 왼쪽 라벨 + 오른쪽 입력 (DESIGN.md FormRow) */
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
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
      <label htmlFor={htmlFor} className="shrink-0 pt-3 text-footnote text-quaternary sm:w-28">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {children}
        {hint && <p className="text-label text-quaternary">{hint}</p>}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-10 pb-8">
      {back ? (
        <Link href={back.href} className="w-fit text-body text-tertiary hover:text-primary">
          ← {back.label}
        </Link>
      ) : (
        <span aria-hidden className="h-[22px]" />
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display font-strong text-primary">{title}</h1>
        {action}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6 border-t border-base py-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline font-strong text-primary">{title}</h2>
        {description && <p className="text-footnote text-tertiary">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function Notice({ tone, children }: { tone: "positive" | "negative"; children: ReactNode }) {
  const style =
    tone === "positive"
      ? "bg-positive-elevated text-content-positive"
      : "bg-negative-elevated text-content-negative";
  return (
    <p role={tone === "negative" ? "alert" : "status"} className={`rounded-lg px-4 py-3 text-footnote ${style}`}>
      {children}
    </p>
  );
}
