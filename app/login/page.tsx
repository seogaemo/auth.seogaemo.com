import type { Metadata } from "next";

import { LoginDivider, LoginLinkButton } from "@/components/login/fields";
import { PasswordLoginForm } from "@/components/login/forms";
import { LoginShell } from "@/components/login/LoginShell";
import { ProviderButton } from "@/components/login/ProviderButton";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { isSocialProvider } from "@/lib/config";
import { loadLoginContext } from "@/lib/login-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "로그인" };

/** 서비스에 전달되는 정보 (scope 기준) */
function sharedInfo(scope: string) {
  const scopes = scope.split(" ");
  const items = [
    scopes.includes("profile") && "이름, 프로필 사진",
    scopes.includes("email") && "이메일",
  ].filter(Boolean);
  return items.length > 0 ? items.join(", ") : "사용자 식별 번호";
}

export default async function LoginPage() {
  const { transaction, service, providers, logoUrl } = await loadLoginContext();
  const password = providers.includes("password");
  const emailCode = providers.includes("email");
  const socials = providers.filter(isSocialProvider);
  const hasOthers = emailCode || socials.length > 0;

  return (
    <LoginShell branding={service}>
      <ServiceHeading name={service.name} logoUrl={logoUrl} />

      <div className="flex flex-col gap-5">
        {password && <PasswordLoginForm canSignup />}
        {password && hasOthers && <LoginDivider />}

        {hasOthers && (
          <nav aria-label="다른 로그인 방식" className="flex flex-col gap-2.5">
            {emailCode && (
              <LoginLinkButton href="/login/email" icon="/icons/mail.svg">
                이메일 코드로 로그인
              </LoginLinkButton>
            )}
            {socials.map((provider) => (
              <ProviderButton key={provider} provider={provider} />
            ))}
          </nav>
        )}

        <p className="text-label text-quaternary">
          {service.name}에 전달되는 정보: {sharedInfo(transaction.scope)}
        </p>
      </div>
    </LoginShell>
  );
}
