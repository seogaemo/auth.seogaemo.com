import type { Metadata } from "next";

import { LoginTextLink } from "@/components/login/fields";
import { EmailCodeRequestForm } from "@/components/login/forms";
import { LoginShell } from "@/components/login/LoginShell";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { loadLoginContext } from "@/lib/login-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "이메일 코드로 로그인" };

export default async function EmailLoginPage() {
  const { service, logoUrl } = await loadLoginContext("email");

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={logoUrl}
        description="비밀번호 없이, 메일로 받은 코드로 로그인해요. 처음이면 바로 가입돼요."
      />
      <div className="flex flex-col gap-4">
        <EmailCodeRequestForm purpose="login" />
        <LoginTextLink href="/login">← 다른 방법으로 로그인</LoginTextLink>
      </div>
    </LoginShell>
  );
}
