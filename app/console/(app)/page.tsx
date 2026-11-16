import Link from "next/link";

import { ProviderIcons } from "@/components/console/ProviderIcons";
import { ButtonLink, PageHeader } from "@/components/console/ui";
import { getPrisma } from "@/cloudflare";
import { requireDeveloper } from "@/lib/console/session";
import { getProviders } from "@/lib/service";

export const metadata = { title: "서비스 목록" };

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

export default async function ServiceListPage() {
  const developer = await requireDeveloper();
  const services = await getPrisma().service.findMany({
    where: { ownerId: developer.id, isSystem: false },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="서비스 목록"
        action={services.length > 0 && <ButtonLink href="/console/services/new">서비스 추가</ButtonLink>}
      />

      {services.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg bg-base p-6">
          <p className="text-body text-secondary">
            아직 등록한 서비스가 없어요. 서비스를 등록하면 client ID를 받아 &quot;Seogaemo로 로그인&quot;을 붙일 수 있어요.
          </p>
          <ButtonLink href="/console/services/new">첫 서비스 등록하기</ButtonLink>
        </div>
      ) : (
        <ul className="flex flex-col">
          {services.map((service) => (
            <li key={service.id} className="border-b border-base last:border-b-0">
              <Link
                href={`/console/services/${service.id}`}
                className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 hover:bg-base"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {service.logoKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/service-logo/${service.id}`} alt="" width={24} height={24} className="size-6 rounded-sm object-cover" />
                  ) : (
                    <span aria-hidden className="flex size-6 items-center justify-center rounded-sm bg-black font-mono text-label text-white">
                      {service.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate text-heading text-primary">{service.name}</span>
                  <span className="shrink-0 text-footnote text-tertiary">{dateFormat.format(service.createdAt)}</span>
                </span>
                <ProviderIcons enabled={getProviders(service)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
