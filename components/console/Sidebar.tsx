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

interface MenuItem {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}

function ServiceMark({ service, size }: { service: SidebarService; size: 20 | 32 }) {
  const box = size === 32 ? "size-8 rounded" : "size-5 rounded-sm";
  if (service.hasLogo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/service-logo/${service.id}`} alt="" width={size} height={size} className={`${box} shrink-0 bg-white object-cover`} />;
  }
  return (
    <span aria-hidden className={`${box} flex shrink-0 items-center justify-center bg-white`}>
      <span className={`font-mono font-[600] text-black ${size === 32 ? "text-[15px]" : "text-[11px]"}`}>
        {service.name.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}

function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`flex items-center gap-1 rounded-lg p-2 transition-colors hover:bg-[rgba(255,255,255,0.06)] ${
            item.active ? "bg-[rgba(255,255,255,0.1)]" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/icons/${item.icon}.svg`} alt="" width={20} height={20} />
          <span className="text-footnote text-white">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/**
 * 검은 사이드바 (Wireframe 15:224): px 8, py 16, 블록 간격 24, 메뉴 p 8 + 20px 아이콘.
 * 서비스 밖(목록, 새로 만들기)에서는 콘솔 메뉴와 내 서비스 바로가기,
 * 서비스 안에서는 그 서비스의 메뉴만 보여준다.
 */
export function Sidebar({ email, name, services }: Props) {
  const pathname = usePathname();
  const match = pathname.match(/^\/console\/services\/([^/]+)/);
  const current = match ? services.find((s) => s.id === match[1]) : undefined;

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 bg-black px-2 py-4 md:sticky md:top-0 md:h-dvh md:w-60">
      <Link href="/console" aria-label="Seogaemo SSO 콘솔 홈" className="flex h-6 items-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/wordmark-white.svg" alt="" width={120} height={20} />
      </Link>

      {current ? <ServiceSection current={current} pathname={pathname} /> : <HomeSection services={services} pathname={pathname} />}

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

function HomeSection({ services, pathname }: { services: SidebarService[]; pathname: string }) {
  return (
    <>
      <Menu
        label="콘솔 메뉴"
        items={[
          {
            href: "/console",
            icon: "captive_portal",
            label: "Applications",
            active: pathname === "/console" || pathname === "/console/services/new",
          },
        ]}
      />
      {services.length > 0 && (
        <nav aria-labelledby="sidebar-services" className="hidden min-h-0 flex-col gap-1 md:flex">
          <h2 id="sidebar-services" className="px-2 pb-1 text-label text-[rgba(255,255,255,0.5)]">
            내 Application
          </h2>
          <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto overscroll-contain">
            {services.map((service) => (
              <Link
                key={service.id}
                href={`/console/services/${service.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              >
                <ServiceMark service={service} size={20} />
                <span className="truncate text-footnote text-[rgba(255,255,255,0.85)]">{service.name}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}

function ServiceSection({ current, pathname }: { current: SidebarService; pathname: string }) {
  const base = `/console/services/${current.id}`;
  const items = [
    { href: base, icon: "captive_portal", label: "Application" },
    { href: `${base}/branding`, icon: "shapes", label: "Branding" },
    { href: `${base}/users`, icon: "group", label: "User Management" },
    { href: `${base}/members`, icon: "admin", label: "Admins" },
  ].map((item) => ({ ...item, active: pathname === item.href }));

  return (
    <>
      <div className="flex items-center gap-2 px-2">
        <ServiceMark service={current} size={32} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-footnote font-strong text-white">{current.name}</span>
          <Link href="/console" className="w-fit rounded text-label text-[rgba(255,255,255,0.6)] hover:text-white">
            Application 변경하기
          </Link>
        </div>
      </div>
      <Menu label="Application 메뉴" items={items} />
    </>
  );
}
