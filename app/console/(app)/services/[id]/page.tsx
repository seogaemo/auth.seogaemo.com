import { deleteService } from "@/actions/services";
import { CopyField } from "@/components/console/CopyField";
import { RotateSecret } from "@/components/console/RotateSecret";
import { SettingsForm } from "@/components/console/SettingsForm";
import { Button, FormRow, Input, Notice, PageHeader, Section } from "@/components/console/ui";
import { PROVIDERS } from "@/lib/config";
import { requireOwnedService } from "@/lib/console/session";
import { endpoint } from "@/lib/config";
import { isProviderConfigured } from "@/lib/oauth/providers";
import { getProviders, getRedirectUris, isPublicClient } from "@/lib/service";

export const metadata = { title: "서비스 설정" };

export default async function ServiceSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; deleteError?: string }>;
}) {
  const { id } = await params;
  const { created, deleteError } = await searchParams;
  const { service } = await requireOwnedService(id);
  const publicClient = isPublicClient(service);

  return (
    <>
      <PageHeader title={service.name} back={{ href: "/console", label: "서비스 목록" }} />
      {created && <Notice tone="positive">서비스를 만들었어요.</Notice>}

      <Section
        title="연동 정보"
        description="OIDC를 지원하는 라이브러리에 Discovery URL과 Client ID를 넣으면 돼요."
      >
        <CopyField label="Discovery URL" value={endpoint("/.well-known/openid-configuration")} />
        <CopyField label="Client ID" value={service.clientId} />
        <FormRow label="앱 종류">
          <p className="pt-3 text-body text-primary">
            {publicClient
              ? "SPA, 모바일 앱 (public client, PKCE만 사용)"
              : "서버가 있는 웹앱 (confidential client)"}
          </p>
        </FormRow>
        {!publicClient && <RotateSecret serviceId={service.id} />}
      </Section>

      <Section title="로그인 설정">
        <SettingsForm
          serviceId={service.id}
          name={service.name}
          redirectUris={getRedirectUris(service)}
          providers={getProviders(service)}
          available={PROVIDERS.filter(isProviderConfigured)}
        />
      </Section>

      <Section
        title="서비스 삭제"
        description="이 서비스의 사용자와 토큰이 모두 지워지고 되돌릴 수 없어요."
      >
        {deleteError && <Notice tone="negative">서비스 이름이 맞지 않아요.</Notice>}
        <form action={deleteService.bind(null, service.id)} className="flex flex-col gap-4">
          <FormRow label="확인" htmlFor="confirm" hint={`지우려면 "${service.name}"을 입력하세요.`}>
            <Input id="confirm" name="confirm" autoComplete="off" required />
          </FormRow>
          <div>
            <Button type="submit" variant="danger">
              서비스 삭제
            </Button>
          </div>
        </form>
      </Section>
    </>
  );
}
