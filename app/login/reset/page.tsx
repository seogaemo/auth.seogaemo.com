import type { Metadata } from "next";

import { LoginTextLink } from "@/components/login/fields";
import { EmailCodeRequestForm } from "@/components/login/forms";
import { LoginShell } from "@/components/login/LoginShell";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { loadLoginContext } from "@/lib/login-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "비밀번호 재설정" };

export default async function ResetPage() {
  const { service, logoUrl } = await loadLoginContext("password");

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={logoUrl}
        action="비밀번호 재설정"
        description="가입한 이메일로 인증 코드를 보내 드려요."
      />
      <div className="flex flex-col gap-4">
        <EmailCodeRequestForm purpose="reset" />
        <LoginTextLink href="/login">← 로그인으로 돌아가기</LoginTextLink>
      </div>
    </LoginShell>
  );
}
