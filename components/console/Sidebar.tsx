"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  email: string | null;
  name: string | null;
}

const SERVICE_TABS = [
  { suffix: "", label: "설정" },
  { suffix: "/branding", label: "Branding" },
  { suffix: "/users", label: "User Management" },
];

/** 검은 사이드바 (DESIGN.md 4.2). 서비스 안에 있으면 그 서비스의 메뉴를 보여준다. */
export function Sidebar({ email, name }: Props) {
  const pathname = usePathname();
  const serviceMatch = pathname.match(/^\/console\/services\/([^/]+)/);
  const serviceId = serviceMatch && serviceMatch[1] !== "new" ? serviceMatch[1] : null;

  const item = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg p-2 text-footnote text-white transition hover:bg-[rgba(255,255,255,0.06)] ${
        active ? "bg-[rgba(255,255,255,0.1)]" : ""
      }`}
    >
      {label}
    </Link>
  );

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 bg-black px-2 py-4 text-white md:sticky md:top-0 md:h-dvh md:w-64">
      <Link href="/console" className="flex items-center gap-2 px-2 font-mono text-title text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/seogaemo-symbol-white.svg" alt="" width={20} height={20} />
        Seogaemo SSO
      </Link>

      <nav aria-label="콘솔" className="flex flex-col gap-1">
        {item("/console", "Application", pathname === "/console" || pathname === "/console/services/new")}
        {serviceId && (
          <div className="ml-3 flex flex-col gap-1 border-l border-[rgba(255,255,255,0.15)] pl-2">
            {SERVICE_TABS.map((tab) => {
              const href = `/console/services/${serviceId}${tab.suffix}`;
              return item(href, tab.label, pathname === href);
            })}
          </div>
        )}
      </nav>

      <div className="flex-1" />

      <form action="/console/logout" method="post" className="flex items-center gap-1 px-1">
        <span className="min-w-0 flex-1 truncate text-footnote text-white" title={email ?? undefined}>
          {email ?? name ?? "로그인됨"}
        </span>
        <button
          type="submit"
          className="rounded p-1 text-footnote text-[rgba(255,255,255,0.6)] hover:text-white"
        >
          로그아웃
        </button>
      </form>
    </aside>
  );
}
