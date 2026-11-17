import Link from "next/link";

import { ActivityList } from "@/components/console/ActivityList";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Page } from "@/components/console/ui";
import { getPrisma } from "@/cloudflare";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "활동 기록" };

const PAGE_SIZE = 50;

/** 활동 기록 전체. 관리자 화면에는 최근 몇 개만 보인다. 1년이 지난 기록은 지워진다. */
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const prisma = getPrisma();
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where: { serviceId: service.id } }),
    prisma.auditLog.findMany({
      where: { serviceId: service.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/console/services/${service.id}/members/activity`;

  return (
    <Page>
      <BackLink href={`/console/services/${service.id}/members`} label="관리자" />
      <div className="flex flex-col gap-6">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="활동 기록 / 최근 1년" />

        <ActivityList logs={logs} />

        {pages > 1 && (
          <nav aria-label="페이지" className="flex justify-center gap-4 py-4 text-footnote">
            {page > 1 && (
              <Link href={`${base}?page=${page - 1}`} className="text-content-accent">
                이전
              </Link>
            )}
            <span className="text-tertiary">
              {page} / {pages}
            </span>
            {page < pages && (
              <Link href={`${base}?page=${page + 1}`} className="text-content-accent">
                다음
              </Link>
            )}
          </nav>
        )}
      </div>
    </Page>
  );
}
