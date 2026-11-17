import { getPrisma } from "@/cloudflare";
import { Integration } from "@/components/console/Integration";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Page } from "@/components/console/ui";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "연동" };

/** 코드에 넣을 것 전부: Client ID, Secret, Redirect URI, 예시 코드. 처음 붙이는 사람은 여기서 끝낸다. */
export default async function IntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const hasUsers = (await getPrisma().user.count({ where: { serviceId: service.id }, take: 1 })) > 0;

  return (
    <Page wide>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="연동" />
        <Integration service={service} firstRun={!hasUsers} />
      </div>
    </Page>
  );
}
