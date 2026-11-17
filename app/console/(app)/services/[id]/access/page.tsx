import { getPrisma } from "@/cloudflare";
import { AllowlistForm } from "@/components/console/AllowlistForm";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Block, Notice, Page } from "@/components/console/ui";
import { getAllowlist, isEmailAllowed } from "@/lib/allowlist";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "접근 제한" };

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
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="접근 제한" />

        <Block
          title="로그인 허용 목록"
          description="회사, 팀 안에서만 쓰는 앱이면 켜세요. 목록 밖 이메일은 로그인도, 가입도 할 수 없어요."
        >
          {blocked > 0 && (
            <Notice tone="warning">
              지금 사용자 중 {blocked.toLocaleString("ko-KR")}명이 허용 목록 밖이에요. 이 사용자들은 다음 로그인부터
              막히고, 로그인 유지(refresh token)도 끊겨요.
            </Notice>
          )}
          <AllowlistForm
            serviceId={service.id}
            restrictLogin={service.restrictLogin}
            allowedEmails={getAllowlist(service)}
          />
        </Block>

        <Block title="이렇게 맞춰요">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li className="text-footnote text-secondary">
              로그인 방식이 무엇이든 확인된 이메일로만 맞춰요. 이메일/비밀번호, 이메일 코드는 코드 메일을 보내기 전에
              막아요.
            </li>
            <li className="text-footnote text-secondary">
              Google, 카카오는 제공자가 확인한 이메일을 봐요. 이메일을 주지 않거나 확인되지 않은 계정은 로그인할 수
              없어요.
            </li>
            <li className="text-footnote text-secondary">
              켜거나 목록에서 빼면 이미 로그인한 사용자도 refresh token을 쓸 때 끊겨요. 이미 받은 access token은
              만료(1시간)까지 쓸 수 있어요.
            </li>
          </ul>
        </Block>
      </div>
    </Page>
  );
}
