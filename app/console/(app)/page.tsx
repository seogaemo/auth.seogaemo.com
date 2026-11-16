import Link from "next/link";

import { getPrisma } from "@/cloudflare";
import { ProviderIcons } from "@/components/console/ProviderIcons";
import { Page, PageTitle } from "@/components/console/ui";
import { requireDeveloper } from "@/lib/console/session";
import { getProviders } from "@/lib/service";

export const metadata = { title: "서비스 목록" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

/** Wireframe 13:195. 행은 py 12, 로고 24, 이름 heading, 날짜 footnote tertiary */
export default async function ServiceListPage() {
  const developer = await requireDeveloper();
  const services = await getPrisma().service.findMany({
    where: { ownerId: developer.id, isSystem: false },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Page>
      <div className="flex flex-col gap-3">
        <PageTitle>서비스 목록</PageTitle>
        {services.length === 0 && (
          <p className="text-footnote text-tertiary">
            서비스를 등록하면 Client ID를 받아 &quot;Seogaemo로 로그인&quot;을 붙일 수 있어요.
          </p>
        )}
        <ul className="flex flex-col gap-1">
          {services.map((service) => (
            <li key={service.id}>
              <Link
                href={`/console/services/${service.id}`}
                className="-mx-3 flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-base"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {service.logoKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/service-logo/${service.id}`}
                      alt=""
                      width={24}
                      height={24}
                      className="size-6 shrink-0 rounded-sm object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-black font-mono text-label font-[600] text-white"
                    >
                      {service.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate text-body font-strong text-primary">{service.name}</span>
                  <span className="shrink-0 text-label text-tertiary">
                    {dateFormat.format(service.createdAt)}
                  </span>
                </span>
                <ProviderIcons enabled={getProviders(service)} />
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/console/services/new"
              className="-mx-3 flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-base"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/add.svg" alt="" width={20} height={20} className="m-0.5" />
              <span className="text-body font-strong text-content-accent">서비스 추가하기</span>
            </Link>
          </li>
        </ul>
      </div>
    </Page>
  );
}
