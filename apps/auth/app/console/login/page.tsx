import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getDeveloper } from "@/lib/console/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seogaemo SSO" };

/** Figma 0:1531: 회색 배경 가운데, 심볼 56 + "Seogaemo SSO", 아래 360 x 64 입체 버튼 */
export default async function ConsoleLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getDeveloper()) redirect("/console");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-base px-4">
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/seogaemo-symbol.svg" alt="" width={40} height={40} />
        {/* DS가 폰트와 글자색을 모든 요소에 직접 걸어서, 글자를 가진 span마다 지정한다 */}
        <h1 className="flex gap-1">
          <span className="font-mono text-[22px] font-[500] tracking-[-0.04em] text-primary">Seogaemo</span>
          <span className="font-mono text-[22px] font-[500] tracking-[-0.04em] text-secondary">SSO</span>
        </h1>
      </div>

      <a
        href="/console/login/start"
        className="flex h-12 w-full max-w-[300px] items-center justify-center gap-2 rounded border-2 border-[rgba(0,0,0,0.2)] bg-[var(--button-primary)] shadow-[0_4px_0_0_#2551a2] transition-[transform,box-shadow,background-color] duration-75 motion-reduce:transition-none hover:bg-[#2667dc] active:translate-y-[4px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2c73f3] focus-visible:ring-offset-4"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/seogaemo-symbol-white.svg" alt="" width={16} height={16} />
        <span className="font-mono text-[15px] font-[600] tracking-[-0.04em] text-white">
          Seogaemo로 로그인
        </span>
      </a>

      {error && (
        <p role="alert" className="text-footnote text-content-negative">
          로그인하지 못했어요. 다시 시도하세요.
        </p>
      )}
    </main>
  );
}
