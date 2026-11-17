import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginDivider, LoginTextLink } from "@/components/login/fields";
import { ContinueAsForm } from "@/components/login/forms";
import { LoginShell } from "@/components/login/LoginShell";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { loadLoginContext } from "@/lib/login-context";
import { currentBrowserKey, findSession } from "@/lib/oauth/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "계정 선택" };

/** prompt=select_account: 이 브라우저에 로그인된 계정으로 계속할지, 다른 계정으로 로그인할지 */
export default async function ContinuePage() {
  const { service, logoUrl } = await loadLoginContext();
  const session = await findSession(await currentBrowserKey(), service.id);
  if (!session) redirect("/login");

  const label = session.user.email ?? session.user.name ?? "로그인된 계정";

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={logoUrl}
        action="계속하기"
        description="이 브라우저에 로그인된 계정이 있어요."
      />
      <div className="flex flex-col gap-5">
        <ContinueAsForm label={label} />
        <LoginDivider />
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2">
          <LoginTextLink href="/login">다른 계정으로 로그인 →</LoginTextLink>
          <LoginTextLink href={`/account?client_id=${encodeURIComponent(service.clientId)}`}>계정 관리</LoginTextLink>
        </div>
      </div>
    </LoginShell>
  );
}
