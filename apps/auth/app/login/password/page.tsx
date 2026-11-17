import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginDivider, LoginTextLink } from "@/components/login/fields";
import { EmailCodeInsteadForm, PasswordLoginForm } from "@/components/login/forms";
import { LoginShell } from "@/components/login/LoginShell";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { loadLoginContext, loadLoginEmail } from "@/lib/login-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "비밀번호 입력" };

/** 둘째 단계: 비밀번호가 있는 계정. 이메일 코드가 켜져 있으면 코드로도 들어갈 수 있다. */
export default async function PasswordPage() {
  const { service, providers, logoUrl } = await loadLoginContext("password");
  const email = await loadLoginEmail();
  if (!email) redirect("/login");

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={logoUrl}
        description={
          <>
            <span className="font-strong text-primary">{email}</span>
            <span className="text-secondary">의 비밀번호를 입력하세요.</span>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <PasswordLoginForm email={email} />
        {providers.includes("email") && (
          <>
            <LoginDivider />
            <EmailCodeInsteadForm />
          </>
        )}
        <LoginTextLink href="/login">← 다른 이메일로 로그인</LoginTextLink>
      </div>
    </LoginShell>
  );
}
