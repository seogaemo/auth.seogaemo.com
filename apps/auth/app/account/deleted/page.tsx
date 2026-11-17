import type { Metadata } from "next";

import { LoginTextLink } from "@/components/login/fields";
import { LoginShell } from "@/components/login/LoginShell";
import { findServiceByClientId, serviceHomeUrl } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "탈퇴 완료" };

export default async function AccountDeletedPage({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
  const { client_id: clientId } = await searchParams;
  const service = clientId ? await findServiceByClientId(clientId) : null;
  const home = service ? serviceHomeUrl(service) : null;

  return (
    <LoginShell branding={service ?? undefined}>
      <div role="status" className="flex flex-col gap-3">
        <h1 className="font-mono text-[24px] font-[450] leading-[1.35] tracking-[-0.04em] text-black">탈퇴했어요</h1>
        <p className="text-footnote text-secondary">
          {service ? `${service.name}의 계정을 지웠어요.` : "계정을 지웠어요."} 같은 이메일로 다시 가입할 수 있어요.
        </p>
        {home && service && <LoginTextLink href={home}>{service.name} 열기 →</LoginTextLink>}
      </div>
    </LoginShell>
  );
}
