import { getPrisma } from "@/cloudflare";
import { AllowlistForm } from "@/components/console/AllowlistForm";
import { DeleteServiceForm } from "@/components/console/DeleteServiceForm";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { SettingsForm } from "@/components/console/SettingsForm";
import { SignupSettingsForm } from "@/components/console/SignupSettingsForm";
import { BackLink, Block, Notice, Page } from "@/components/console/ui";
import { getAllowlist, isEmailAllowed } from "@/lib/allowlist";
import { PROVIDERS } from "@/lib/config";
import { requireServiceAccess } from "@/lib/console/session";
import { isProviderConfigured } from "@/lib/oauth/providers";
import { getProviders, getRedirectUris } from "@/lib/service";

export const metadata = { title: "설정" };

/** 누가, 어떻게 로그인하고 가입하는지. 위에서 아래로: 로그인 방식, 가입, 접근 제한, 삭제 */
export default async function ServiceSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service, isOwner } = await requireServiceAccess(id);

  // 접근 제한이 켜져 있을 때 지금 사용자 중 몇 명이 목록 밖인지 알려준다
  const blocked = service.restrictLogin
    ? (
        await getPrisma().user.findMany({ where: { serviceId: service.id }, select: { email: true } })
      ).filter((u) => !isEmailAllowed(service, u.email)).length
    : 0;

  return (
    <Page>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />

      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="설정" />

        <Block title="기본" description="앱 이름, 로그인 뒤 돌아올 주소, 쓸 수 있는 로그인 방식이에요.">
          <SettingsForm
            serviceId={service.id}
            name={service.name}
            redirectUris={getRedirectUris(service)}
            providers={getProviders(service)}
            available={PROVIDERS.filter(isProviderConfigured)}
          />
        </Block>

        <Block title="가입과 약관" description="새 가입을 받을지, 로그인 화면에 걸 약관을 정해요.">
          <SignupSettingsForm
            serviceId={service.id}
            signupEnabled={service.signupEnabled}
            termsUrl={service.termsUrl}
            privacyUrl={service.privacyUrl}
          />
        </Block>

        <section id="access" className="scroll-mt-20">
          <Block
            title="접근 제한"
            description="회사, 팀 안에서만 쓰는 앱이면 켜세요. 목록 밖 이메일은 로그인도, 가입도 할 수 없어요. Google, 카카오도 제공자가 확인한 이메일로 맞춰요."
          >
            {blocked > 0 && (
              <Notice tone="warning">
                지금 사용자 중 {blocked.toLocaleString("ko-KR")}명이 허용 목록 밖이에요. 다음 로그인부터 막히고,
                로그인 유지(refresh token)도 끊겨요.
              </Notice>
            )}
            <AllowlistForm serviceId={service.id} restrictLogin={service.restrictLogin} allowedEmails={getAllowlist(service)} />
          </Block>
        </section>

        {isOwner && (
          <Block title="앱 삭제" description="이 앱의 사용자와 토큰이 모두 지워지고 되돌릴 수 없어요.">
            <DeleteServiceForm serviceId={service.id} name={service.name} />
          </Block>
        )}
      </div>
    </Page>
  );
}
