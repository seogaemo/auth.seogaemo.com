import { BrandingForm } from "@/components/console/BrandingForm";
import { PageHeader, Section } from "@/components/console/ui";
import { LoginShell } from "@/components/login/LoginShell";
import { ProviderButton } from "@/components/login/ProviderButton";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { requireOwnedService } from "@/lib/console/session";
import { getProviders } from "@/lib/service";

export const metadata = { title: "Branding" };

export default async function BrandingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service } = await requireOwnedService(id);
  const logoUrl = service.logoKey ? `/service-logo/${service.id}?v=${encodeURIComponent(service.logoKey)}` : null;
  const providers = getProviders(service);

  return (
    <>
      <PageHeader title="Branding" back={{ href: `/console/services/${service.id}`, label: service.name }} />

      <Section title="로그인 화면">
        <BrandingForm
          serviceId={service.id}
          brandColor={service.brandColor}
          brandBackground={service.brandBackground}
          logoUrl={logoUrl}
        />
      </Section>

      <Section title="미리보기" description="저장된 설정으로 사용자에게 보이는 화면이에요.">
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
      </Section>
    </>
  );
}
