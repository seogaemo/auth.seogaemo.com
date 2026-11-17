import { getPrisma } from "@/cloudflare";
import { AllowlistForm } from "@/components/console/AllowlistForm";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Block, Notice, Page } from "@/components/console/ui";
import { getAllowlist, isEmailAllowed } from "@/lib/allowlist";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "접근 제한" };

/** 누가 로그인할 수 있는지. 사용자 목록에서 "허용 목록 밖"을 보고 바로 들어오는 곳이라 사용자 아래에 둔다. */
export default async function AccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);

  // 켜져 있을 때 지금 사용자 중 몇 명이 목록 밖인지 알려준다
  const blocked = service.restrictLogin
    ? (
        await getPrisma().user.findMany({ where: { serviceId: service.id }, select: { email: true } })
      ).filter((u) => !isEmailAllowed(service, u.email)).length
    : 0;

  return (
    <Page>
      <BackLink href={`/console/services/${service.id}/users`} label="사용자" />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="접근 제한" />

        <Block
          title="로그인 허용 목록"
          description="회사, 팀 안에서만 쓰는 앱이면 켜세요. 목록 밖 이메일은 로그인도, 가입도 할 수 없어요. Google, 카카오도 제공자가 확인한 이메일로 맞춰요."
        >
          {blocked > 0 && (
            <Notice tone="warning">
              지금 사용자 중 {blocked.toLocaleString("ko-KR")}명이 허용 목록 밖이에요. 다음 로그인부터 막히고, 로그인
              유지(refresh token)도 끊겨요.
            </Notice>
          )}
          <AllowlistForm serviceId={service.id} restrictLogin={service.restrictLogin} allowedEmails={getAllowlist(service)} />
        </Block>
      </div>
    </Page>
  );
}
