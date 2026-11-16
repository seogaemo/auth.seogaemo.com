"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarService {
  id: string;
  name: string;
  hasLogo: boolean;
}

interface Props {
  email: string | null;
  name: string | null;
  services: SidebarService[];
}

/** 검은 사이드바 (Wireframe 15:224): px 8, py 16, 블록 간격 24, 메뉴 p 8 + 20px 아이콘 */
export function Sidebar({ email, name, services }: Props) {
  const pathname = usePathname();
  const match = pathname.match(/^\/console\/services\/([^/]+)/);
  const current = match ? services.find((s) => s.id === match[1]) : undefined;
  const base = current ? `/console/services/${current.id}` : null;

  const items = [
    { href: base ?? "/console", icon: "captive_portal", label: "Application", enabled: true },
    { href: base ? `${base}/branding` : null, icon: "shapes", label: "Branding", enabled: !!base },
    { href: base ? `${base}/users` : null, icon: "group", label: "User Management", enabled: !!base },
  ];

  const isActive = (href: string | null) =>
    href !== null &&
    (href === "/console"
      ? pathname === "/console" || pathname === "/console/services/new"
      : pathname === href);

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 bg-black px-2 py-4 md:sticky md:top-0 md:h-dvh md:w-64">
      <Link href="/console" aria-label="Seogaemo SSO 콘솔 홈" className="flex h-6 items-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/wordmark-white.svg" alt="" width={120} height={20} />
      </Link>

      {current && (
        <div className="flex items-center gap-2 px-2">
          {current.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/service-logo/${current.id}`} alt="" width={40} height={40} className="size-10 rounded-sm bg-white object-cover" />
          ) : (
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-white font-mono text-headline font-[600] text-black">
              {current.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-title font-strong text-white">{current.name}</span>
            <Link href="/console" className="text-label text-[rgba(255,255,255,0.6)] hover:text-white">
              서비스 변경하기
            </Link>
          </div>
        </div>
      )}

      <nav aria-label="콘솔 메뉴" className="flex flex-col gap-1">
        {items.map((item) =>
          item.enabled && item.href ? (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex items-center gap-1 rounded-lg p-2 transition-colors hover:bg-[rgba(255,255,255,0.06)] ${
                isActive(item.href) ? "bg-[rgba(255,255,255,0.1)]" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/icons/${item.icon}.svg`} alt="" width={20} height={20} />
              <span className="text-footnote text-white">{item.label}</span>
            </Link>
          ) : (
            <span
              key={item.label}
              aria-disabled
              title="서비스를 먼저 고르세요"
              className="flex items-center gap-1 rounded-lg p-2 opacity-30"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/icons/${item.icon}.svg`} alt="" width={20} height={20} />
              <span className="text-footnote text-white">{item.label}</span>
            </span>
          ),
        )}
      </nav>

      <div className="flex-1" />

      <form action="/console/logout" method="post" className="flex items-center gap-1 px-1">
        <span className="min-w-0 flex-1 truncate text-footnote text-white" title={email ?? undefined}>
          {email ?? name ?? "로그인됨"}
        </span>
        <button type="submit" aria-label="로그아웃" title="로그아웃" className="rounded p-0.5 hover:bg-[rgba(255,255,255,0.1)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/logout-white.svg" alt="" width={20} height={20} />
        </button>
      </form>
    </aside>
  );
}
