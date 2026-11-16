import { BrandingForm } from "@/components/console/BrandingForm";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Block, Page } from "@/components/console/ui";
import { LoginShell } from "@/components/login/LoginShell";
import { ProviderButton } from "@/components/login/ProviderButton";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { requireOwnedService } from "@/lib/console/session";
import { getProviders } from "@/lib/service";

export const metadata = { title: "Branding" };

/** Page 1 0:1072: 왼쪽 설정, 오른쪽 로그인 화면 미리보기 */
export default async function BrandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service } = await requireOwnedService(id);
  const logoUrl = service.logoKey
    ? `/service-logo/${service.id}?v=${encodeURIComponent(service.logoKey)}`
    : null;
  const providers = getProviders(service);

  return (
    <Page wide>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="Branding" />
          <Block title="로그인 화면" description="저장하면 오른쪽 미리보기와 실제 로그인 화면에 바로 반영돼요.">
            <BrandingForm
              serviceId={service.id}
              brandColor={service.brandColor}
              brandBackground={service.brandBackground}
              logoUrl={logoUrl}
            />
          </Block>
        </div>

        <section aria-label="로그인 화면 미리보기" className="flex flex-col gap-2 xl:sticky xl:top-4">
          <span className="text-footnote text-quaternary">미리보기</span>
          <LoginShell branding={service} preview>
            <ServiceHeading name={service.name} logoUrl={logoUrl} />
            <div className="flex flex-col gap-3">
              {providers.length === 0 ? (
                <p className="text-footnote text-quaternary">켜진 인증 방식이 없어요.</p>
              ) : (
                providers.map((provider) => <ProviderButton key={provider} provider={provider} preview />)
              )}
            </div>
          </LoginShell>
        </section>
      </div>
    </Page>
  );
}
