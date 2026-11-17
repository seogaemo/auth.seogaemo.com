"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";

interface SidebarService {
  id: string;
  name: string;
  hasLogo: boolean;
}

interface Props {
  email: string | null;
  name: string | null;
  /** 콘솔 계정의 계정 화면 (/account?client_id=seogaemo-console) */
  accountHref: string;
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
 * 서비스 밖(목록, 새로 만들기)에서는 콘솔 메뉴와 내 앱 바로가기,
 * 서비스 안에서는 그 앱의 메뉴만 보여준다.
 *
 * md 이상은 왼쪽에 고정. 폰에서는 위에 얇은 바(로고 + 메뉴 버튼)만 두고,
 * 버튼을 누르면 같은 내용을 왼쪽 서랍(<dialog>)으로 연다.
 */
export function Sidebar({ email, name, accountHref, services }: Props) {
  const pathname = usePathname();
  const match = pathname.match(/^\/console\/services\/([^/]+)/);
  const current = match ? services.find((s) => s.id === match[1]) : undefined;
  const drawer = useRef<HTMLDialogElement>(null);

  // 서랍 안 링크로 이동하면 닫는다
  useEffect(() => {
    drawer.current?.close();
  }, [pathname]);

  const body = (
    <>
      {current ? <ServiceSection current={current} pathname={pathname} /> : <HomeSection services={services} pathname={pathname} />}
      <div className="flex-1" />
      <Account email={email} name={name} accountHref={accountHref} />
    </>
  );

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 bg-black pl-4 pr-2 md:hidden">
        <Wordmark />
        <button
          type="button"
          aria-label="메뉴 열기"
          aria-haspopup="dialog"
          aria-controls="console-drawer"
          onClick={() => drawer.current?.showModal()}
          className="flex size-10 items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg aria-hidden viewBox="0 0 24 24" width={24} height={24}>
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-white" />
          </svg>
        </button>
      </header>

      <dialog
        ref={drawer}
        id="console-drawer"
        aria-label="콘솔 메뉴"
        onClick={(e) => {
          // 바깥(배경) 클릭으로 닫기
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[280px] max-w-[85vw] bg-black p-0 backdrop:bg-[rgba(0,0,0,0.5)] md:hidden"
      >
        <div className="flex h-full flex-col gap-6 overflow-y-auto overscroll-contain px-2 py-4">
          <div className="flex items-center justify-between pl-2">
            <Wordmark />
            <button
              type="button"
              aria-label="메뉴 닫기"
              onClick={() => drawer.current?.close()}
              className="flex size-10 items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg aria-hidden viewBox="0 0 24 24" width={24} height={24}>
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-white" />
              </svg>
            </button>
          </div>
          {body}
        </div>
      </dialog>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 bg-black px-2 py-4 md:flex">
        <div className="px-2">
          <Wordmark />
        </div>
        {body}
      </aside>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/console" aria-label="Seogaemo SSO 콘솔 홈" className="flex h-6 items-center rounded">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/wordmark-white.svg" alt="" width={120} height={20} />
    </Link>
  );
}

/** 내 이메일을 누르면 계정 화면(비밀번호, 기기, 탈퇴). 옆 버튼은 로그아웃 */
function Account({ email, name, accountHref }: { email: string | null; name: string | null; accountHref: string }) {
  return (
    <form action="/console/logout" method="post" className="flex items-center gap-1 px-1">
      <a
        href={accountHref}
        title="내 계정"
        className="flex min-w-0 flex-1 flex-col rounded px-1 py-0.5 hover:bg-[rgba(255,255,255,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span className="truncate text-footnote text-white">{email ?? name ?? "로그인됨"}</span>
        <span className="text-label text-[rgba(255,255,255,0.6)]">내 계정</span>
      </a>
      <button type="submit" aria-label="로그아웃" title="로그아웃" className="rounded p-0.5 hover:bg-[rgba(255,255,255,0.1)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/logout-white.svg" alt="" width={20} height={20} />
      </button>
    </form>
  );
}

function HomeSection({ services, pathname }: { services: SidebarService[]; pathname: string }) {
  // 서랍과 데스크톱 사이드바에 같은 목록이 두 번 그려지니 id를 따로 만든다
  const headingId = useId();
  return (
    <>
      <Menu
        label="콘솔 메뉴"
        items={[
          {
            href: "/console",
            icon: "captive_portal",
            label: "앱 목록",
            active: pathname === "/console" || pathname === "/console/services/new",
          },
        ]}
      />
      {services.length > 0 && (
        <nav aria-labelledby={headingId} className="flex min-h-0 flex-col gap-1">
          <h2 id={headingId} className="px-2 pb-1 text-label text-[rgba(255,255,255,0.5)]">
            내 앱
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
    { href: base, icon: "stats", label: "개요" },
    { href: `${base}/integration`, icon: "code", label: "연동" },
    { href: `${base}/branding`, icon: "shapes", label: "로그인 화면" },
    { href: `${base}/users`, icon: "group", label: "사용자" },
    { href: `${base}/members`, icon: "admin", label: "관리자" },
  ].map((item) => ({
    ...item,
    // 사용자 상세(/users/[id]), 접근 제한(/users/access), 활동 기록(/members/activity)에서도 위 메뉴를 켠다
    active: pathname === item.href || (item.href !== base && pathname.startsWith(`${item.href}/`)),
  }));

  return (
    <>
      <div className="flex items-center gap-2 px-2">
        <ServiceMark service={current} size={32} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-footnote font-strong text-white">{current.name}</span>
          <Link href="/console" className="w-fit rounded text-label text-[rgba(255,255,255,0.6)] hover:text-white">
            다른 앱 고르기
          </Link>
        </div>
      </div>
      <Menu label="앱 메뉴" items={items} />
    </>
  );
}
