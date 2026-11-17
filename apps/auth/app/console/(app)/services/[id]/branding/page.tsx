import { BrandingForm } from "@/components/console/BrandingForm";
import { LivePreview, LoginDraftProvider } from "@/components/console/LoginDraft";
import { LoginMethodsForm } from "@/components/console/LoginMethodsForm";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { SignupSettingsForm } from "@/components/console/SignupSettingsForm";
import { BackLink, Block, Page } from "@/components/console/ui";
import { PROVIDERS } from "@/lib/config";
import { requireServiceAccess } from "@/lib/console/session";
import { isProviderConfigured } from "@/lib/oauth/providers";
import { getProviders } from "@/lib/service";

export const metadata = { title: "로그인 화면" };

/**
 * 사용자에게 보이는 로그인 화면에 관한 것 전부. 왼쪽에서 입력하는 대로 오른쪽 미리보기가 바뀌고, 저장은 묶음마다 따로 한다.
 * 위에서 아래로: 이름과 로그인 버튼, 로고와 색, 가입과 약관 링크.
 */
export default async function LoginScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const logoUrl = service.logoKey ? `/service-logo/${service.id}?v=${encodeURIComponent(service.logoKey)}` : null;
  const providers = getProviders(service);
  const available = PROVIDERS.filter(isProviderConfigured);

  return (
    <Page wide>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />

      <LoginDraftProvider
        saved={{
          name: service.name,
          providers: providers.filter((p) => available.includes(p)),
          brandColor: service.brandColor ?? "",
          brandBackground: service.brandBackground ?? "",
          logoUrl,
          termsUrl: service.termsUrl ?? "",
          privacyUrl: service.privacyUrl ?? "",
        }}
      >
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-8">
            <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="로그인 화면" />

            <Block title="이름과 로그인 방식" description="화면 제목과 보여줄 로그인 버튼이에요.">
              <LoginMethodsForm serviceId={service.id} name={service.name} providers={providers} available={available} />
            </Block>

            <Block title="로고와 색">
              <BrandingForm
                serviceId={service.id}
                brandColor={service.brandColor}
                brandBackground={service.brandBackground}
                logoUrl={logoUrl}
              />
            </Block>

            <Block title="가입과 약관" description="새 가입을 받을지, 화면 아래에 걸 약관 링크를 정해요.">
              <SignupSettingsForm
                serviceId={service.id}
                signupEnabled={service.signupEnabled}
                termsUrl={service.termsUrl}
                privacyUrl={service.privacyUrl}
              />
            </Block>
          </div>

          <section aria-label="로그인 화면 미리보기" className="flex flex-col gap-2 xl:sticky xl:top-4">
            <LivePreview available={available} />
          </section>
        </div>
      </LoginDraftProvider>
    </Page>
  );
}
