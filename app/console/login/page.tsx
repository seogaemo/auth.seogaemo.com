import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginShell } from "@/components/login/LoginShell";
import { getDeveloper } from "@/lib/console/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seogaemo SSO 콘솔" };

export default async function ConsoleLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getDeveloper()) redirect("/console");
  const { error } = await searchParams;

  return (
    <LoginShell>
      <header className="flex flex-col gap-2">
        <h1 className="font-mono text-[32px] font-[450] leading-[1.4] tracking-[-0.02em] text-black">
          Seogaemo SSO
        </h1>
        <p className="text-body text-secondary">
          내 서비스에 Seogaemo 로그인을 붙이고 관리하세요.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-footnote text-content-negative">
          로그인하지 못했어요. 다시 시도하세요.
        </p>
      )}
      <a
        href="/console/login/start"
        className="flex h-16 w-full items-center justify-center gap-2 rounded border-[3px] border-login-stroke-strong bg-login-brand font-mono text-[18px] font-[600] tracking-[-0.02em] text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/seogaemo-symbol-white.svg" alt="" width={20} height={20} />
        Seogaemo로 로그인
      </a>
    </LoginShell>
  );
}
