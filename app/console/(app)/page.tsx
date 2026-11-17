import type { Metadata } from "next";
import Link from "next/link";

import { getPrisma } from "@/cloudflare";
import { ButtonLink } from "@/components/console/ui";
import { PROVIDER_LABELS, providerIcon, type Provider } from "@/lib/config";
import { manageableServices, requireDeveloper } from "@/lib/console/session";
import { getProviders, isPublicClient } from "@/lib/service";

export const metadata: Metadata = { title: "앱 목록" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

/** 넓은 화면에서 머리줄과 각 줄이 같은 칸을 쓴다 */
const COLUMNS = "lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_112px_72px_112px] lg:items-center lg:gap-6";

function AppMark({ id, name, hasLogo }: { id: string; name: string; hasLogo: boolean }) {
  if (hasLogo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/service-logo/${id}`} alt="" width={36} height={36} className="size-9 shrink-0 rounded-md object-cover" />;
  }
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#101016]">
      <span className="font-mono text-[15px] font-[600] text-white">{name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

/** 켜진 인증 방식만. 꺼진 것까지 보여주면 줄이 시끄러워진다 (상세 설정에서 다 보인다) */
function EnabledProviders({ providers }: { providers: Provider[] }) {
  if (providers.length === 0) return <span className="text-label text-tertiary">없음</span>;
  return (
    <ul className="flex items-center gap-1.5">
      {providers.map((provider) => (
        <li key={provider} className="flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={providerIcon(provider, true)} alt={PROVIDER_LABELS[provider]} title={PROVIDER_LABELS[provider]} width={16} height={16} />
        </li>
      ))}
    </ul>
  );
}

/**
 * 앱 목록. 장식 없는 목록 한 장: 이름, Client ID, 켜진 인증 방식, 사용자 수, 만든 날.
 * 줄 전체가 눌리지만 링크 이름은 앱 이름만 (나머지는 칸마다 읽힌다).
 */
export default async function ApplicationListPage() {
  const developer = await requireDeveloper();
  const services = await getPrisma().service.findMany({
    where: manageableServices(developer),
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true } } },
  });

  if (services.length === 0) return <EmptyState />;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 font-mono text-[24px] font-[500] leading-[1.35] tracking-[-0.04em] text-primary">
          앱 목록
          <span className="text-[15px] text-tertiary">{services.length}</span>
        </h1>
        <ButtonLink href="/console/services/new">새 앱</ButtonLink>
      </header>

      <div className="border-t-2 border-[#101016]">
        <div aria-hidden className={`hidden h-9 border-b border-base px-3 ${COLUMNS}`}>
          {["이름", "Client ID", "인증 방식", "사용자", "만든 날"].map((label, index) => (
            <span key={label} className={`text-label text-tertiary ${index === 3 ? "text-right" : ""}`}>
              {label}
            </span>
          ))}
        </div>

        <ul>
          {services.map((service) => {
            const shared = service.ownerId !== developer.id;
            return (
              <li
                key={service.id}
                className={`relative flex flex-col gap-2 border-b border-base px-3 py-3.5 hover:bg-base ${COLUMNS}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AppMark id={service.id} name={service.name} hasLogo={!!service.logoKey} />
                  <div className="flex min-w-0 flex-col">
                    <Link
                      href={`/console/services/${service.id}`}
                      className="truncate rounded-sm text-footnote font-strong text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--content-accent)]"
                    >
                      {service.name}
                    </Link>
                    <span className="text-label text-tertiary">
                      {isPublicClient(service) ? "SPA, 모바일" : "웹 서버"}
                      {shared && " / 관리자로 참여"}
                    </span>
                  </div>
                </div>

                <code className="truncate pl-12 font-mono text-label text-secondary lg:pl-0">
                  <span className="sr-only">Client ID </span>
                  {service.clientId}
                </code>

                <div className="hidden lg:flex">
                  <span className="sr-only">인증 방식 </span>
                  <EnabledProviders providers={getProviders(service)} />
                </div>

                <span className="hidden text-right text-footnote tabular-nums text-secondary lg:block">
                  <span className="sr-only">사용자 </span>
                  {service._count.users.toLocaleString("ko-KR")}
                  <span className="sr-only">명</span>
                </span>

                <span className="hidden text-label text-tertiary lg:block">
                  <span className="sr-only">만든 날 </span>
                  {dateFormat.format(service.createdAt)}
                </span>

                {/* 좁은 화면: 칸 대신 한 줄 요약 */}
                <span className="pl-12 text-label text-tertiary lg:hidden">
                  사용자 {service._count.users.toLocaleString("ko-KR")}명, {dateFormat.format(service.createdAt)} 만듦
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** 앱이 하나도 없을 때. 무엇을 하는 곳인지와 첫 행동 하나. */
function EmptyState() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-start gap-6 pb-16 pt-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-mono text-[24px] font-[500] leading-[1.35] tracking-[-0.04em] text-primary">
          아직 앱이 없어요
        </h1>
        <p className="break-keep text-pretty text-footnote text-secondary">
          앱을 만들면 Client ID를 받아요. 웹사이트나 모바일 앱의 OIDC 라이브러리에 넣으면 &quot;Seogaemo로
          로그인&quot;을 쓸 수 있어요.
        </p>
      </div>
      <ButtonLink href="/console/services/new">앱 만들기</ButtonLink>
    </div>
  );
}
