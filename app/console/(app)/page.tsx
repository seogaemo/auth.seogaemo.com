import type { Metadata } from "next";
import Link from "next/link";

import { getPrisma } from "@/cloudflare";
import { ButtonLink } from "@/components/console/ui";
import { PROVIDER_LABELS, providerIcon, type Provider } from "@/lib/config";
import { manageableServices, requireDeveloper } from "@/lib/console/session";
import { getProviders, isPublicClient } from "@/lib/service";

export const metadata: Metadata = { title: "Applications" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });
const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_BRAND = "#2c73f4";

/** DS가 모든 요소(*)에 글자색을 걸어서 svg 안 path는 색을 물려받지 못한다. 색 클래스는 path에 준다. */
function PlusIcon({ className = "", color }: { className?: string; color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" width={20} height={20} className={className}>
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={color} />
    </svg>
  );
}

function ArrowIcon({ className = "", color }: { className?: string; color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" width={20} height={20} className={className}>
      <path d="M4 10h11M11 5.5 15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color} />
    </svg>
  );
}

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "accent" }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-caption font-strong ${
        tone === "accent" ? "bg-accent-elevated text-content-accent" : "bg-base text-tertiary"
      }`}
    >
      {children}
    </span>
  );
}

/** 켜진 로그인 수단만 작게. 꺼진 것까지 보여주면 카드가 시끄러워진다 (상세 설정에서 다 보인다) */
function EnabledProviders({ providers }: { providers: Provider[] }) {
  if (providers.length === 0) return <span className="text-label text-quaternary">켜진 인증 방식 없음</span>;
  return (
    <ul className="flex items-center gap-2" aria-label="켜진 인증 방식">
      {providers.map((provider) => (
        <li key={provider} className="flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={providerIcon(provider, true)} alt={PROVIDER_LABELS[provider]} title={PROVIDER_LABELS[provider]} width={18} height={18} />
        </li>
      ))}
    </ul>
  );
}

/**
 * 서비스 목록. 카드마다 서비스 브랜드 색 띠, 로고, Client ID, 켜진 로그인 수단, 사용자 수.
 * Seogaemo 시그니처(단단한 아래 그림자, 모노 글꼴)는 유지하고 시안 구조는 따르지 않는다.
 */
export default async function ServiceListPage() {
  const developer = await requireDeveloper();
  const services = await getPrisma().service.findMany({
    where: manageableServices(developer),
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true } } },
  });

  if (services.length === 0) return <EmptyState />;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-mono text-[24px] font-[500] leading-[1.35] tracking-[-0.04em] text-primary">Applications</h1>
          <p className="text-footnote text-tertiary">
            Seogaemo로 로그인을 붙인 Application {services.length}개
          </p>
        </div>
        <ButtonLink href="/console/services/new">
          <PlusIcon className="-ml-1" color="text-white" />
          <span className="text-footnote font-strong text-white">새 Application</span>
        </ButtonLink>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => {
          const brand = service.brandColor && HEX.test(service.brandColor) ? service.brandColor : DEFAULT_BRAND;
          const shared = service.ownerId !== developer.id;
          return (
            <li key={service.id} className="flex">
              <Link
                href={`/console/services/${service.id}`}
                className="group flex w-full flex-col overflow-hidden rounded-xl border-2 border-[rgba(0,0,0,0.08)] bg-white shadow-[0_4px_0_0_rgba(0,0,0,0.06)] transition-[transform,box-shadow,border-color] duration-100 hover:-translate-y-0.5 hover:border-[rgba(0,0,0,0.16)] hover:shadow-[0_6px_0_0_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                {/* 서비스 브랜드 색 (Branding에서 정한 색, 없으면 기본 파랑) */}
                <span aria-hidden className="h-1.5 w-full" style={{ background: brand }} />

                <div className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start gap-3">
                    {service.logoKey ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/service-logo/${service.id}`} alt="" width={44} height={44} className="size-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-lg" style={{ background: brand }}>
                        <span className="font-mono text-[20px] font-[600] text-white">{service.name.slice(0, 1).toUpperCase()}</span>
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-body font-strong text-primary">{service.name}</span>
                      <span className="flex flex-wrap gap-1">
                        <Tag>{isPublicClient(service) ? "SPA, 앱" : "웹 서버"}</Tag>
                        {shared && <Tag tone="accent">관리자</Tag>}
                      </span>
                    </div>
                    <ArrowIcon className="mt-0.5 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" color="text-unselected transition-colors group-hover:text-content-accent" />
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-caption text-quaternary">Client ID</span>
                    <code className="truncate font-mono text-label text-secondary">{service.clientId}</code>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-base pt-3">
                    <EnabledProviders providers={getProviders(service)} />
                    <span className="shrink-0 text-label text-tertiary">
                      사용자 {service._count.users.toLocaleString("ko-KR")}명
                      <span aria-hidden className="text-unselected"> / </span>
                      <span className="sr-only">, 만든 날 </span>
                      {dateFormat.format(service.createdAt)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}

        <li className="flex">
          <Link
            href="/console/services/new"
            className="group flex min-h-[176px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[rgba(0,0,0,0.14)] text-tertiary transition-colors hover:border-[#2c73f4] hover:bg-[rgba(44,115,244,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] focus-visible:ring-offset-2"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-base transition-colors group-hover:bg-[#2c73f4]">
              <PlusIcon color="text-tertiary transition-colors group-hover:text-white" />
            </span>
            <span className="text-footnote font-strong text-tertiary group-hover:text-content-accent">새 Application 만들기</span>
          </Link>
        </li>
      </ul>
    </div>
  );
}

const STEPS = [
  { title: "Application 만들기", body: "이름과 Redirect URI를 넣으면 Client ID를 받아요." },
  { title: "인증 방식 고르기", body: "이메일/비밀번호, 이메일 코드, Google, 카카오 중에서 켜요." },
  { title: "앱에 연결하기", body: "OIDC 라이브러리에 Discovery URL과 Client ID를 넣으면 끝." },
];

/** 서비스가 하나도 없을 때. 무엇을 하는 곳인지와 첫 단계를 보여준다. */
function EmptyState() {
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8 pb-16 pt-6">
      <div className="flex flex-col items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/seogaemo-symbol.svg" alt="" width={40} height={40} />
        <div className="flex flex-col gap-2">
          <h1 className="font-mono text-[28px] font-[500] leading-[1.35] tracking-[-0.04em] text-primary">
            첫 Application을 등록해 보세요
          </h1>
          <p className="break-keep text-pretty text-body text-secondary">
            등록하면 내 앱이나 웹사이트에 &quot;Seogaemo로 로그인&quot; 버튼을 붙일 수 있어요. 사용자 관리와 로그인 화면은 Seogaemo가 맡아요.
          </p>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4 rounded-xl border-2 border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_4px_0_0_rgba(0,0,0,0.06)]">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#101016]">
              <span className="font-mono text-[15px] font-[600] text-white">{index + 1}</span>
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-footnote font-strong text-primary">{step.title}</span>
              <span className="text-footnote text-tertiary">{step.body}</span>
            </div>
          </li>
        ))}
      </ol>

      <div>
        <ButtonLink href="/console/services/new" size="lg">
          <PlusIcon className="-ml-1" color="text-white" />
          <span className="text-body font-strong text-white">Application 만들기</span>
        </ButtonLink>
      </div>
    </div>
  );
}
