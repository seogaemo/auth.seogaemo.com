import { getPrisma } from "@/cloudflare";
import { Integration } from "@/components/console/Integration";
import { LoginStats } from "@/components/console/LoginStats";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Notice, Page } from "@/components/console/ui";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "개요" };

/**
 * 앱 첫 화면. 붙이는 데 필요한 것(연동 정보, 예시 코드)과 잘 쓰이고 있는지(최근 14일)를 한 곳에서.
 * 아직 사용자가 없으면 연동이 먼저고 통계는 빈 그래프뿐이라 뺀다.
 */
export default async function ServiceOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const { service } = await requireServiceAccess(id);
  const totalUsers = await getPrisma().user.count({ where: { serviceId: service.id } });

  return (
    <Page wide>
      <BackLink href="/console" label="앱 목록" />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="개요" />
        {created && <Notice tone="positive">앱을 만들었어요. 아래 예시 코드로 로그인을 붙여 보세요.</Notice>}

        {totalUsers > 0 && <LoginStats serviceId={service.id} totalUsers={totalUsers} />}
        <Integration service={service} firstRun={totalUsers === 0} />
      </div>
    </Page>
  );
}
