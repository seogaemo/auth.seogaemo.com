import { CopyField } from "@/components/console/CopyField";
import { DeleteServiceForm } from "@/components/console/DeleteServiceForm";
import { RotateSecret } from "@/components/console/RotateSecret";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { SettingsForm } from "@/components/console/SettingsForm";
import { SignupSettingsForm } from "@/components/console/SignupSettingsForm";
import { BackLink, Block, InfoRow, Notice, Page } from "@/components/console/ui";
import { endpoint, PROVIDERS } from "@/lib/config";
import { requireServiceAccess } from "@/lib/console/session";
import { isProviderConfigured } from "@/lib/oauth/providers";
import { getProviders, getRedirectUris, isPublicClient } from "@/lib/service";

export const metadata = { title: "앱 설정" };

export default async function ServiceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const { service, isOwner } = await requireServiceAccess(id);
  const publicClient = isPublicClient(service);

  return (
    <Page>
      <BackLink href="/console" label="앱 목록" />

      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="설정" />
        {created && <Notice tone="positive">앱을 만들었어요.</Notice>}

        <Block title="연동 정보" description="OIDC를 지원하는 라이브러리에 Discovery URL과 Client ID를 넣으면 돼요.">
          <CopyField label="Discovery URL" value={endpoint("/.well-known/openid-configuration")} />
          <CopyField label="Client ID" value={service.clientId} />
          {publicClient ? (
            <InfoRow label="Client Secret">
              <span className="text-footnote text-quaternary">SPA, 모바일 앱은 Client Secret을 쓰지 않아요 (PKCE만 사용)</span>
            </InfoRow>
          ) : (
            <RotateSecret serviceId={service.id} />
          )}
        </Block>

        <Block title="로그인 설정">
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

        {isOwner && (
          <Block title="앱 삭제" description="이 앱의 사용자와 토큰이 모두 지워지고 되돌릴 수 없어요.">
            <DeleteServiceForm serviceId={service.id} name={service.name} />
          </Block>
        )}
      </div>
    </Page>
  );
}
