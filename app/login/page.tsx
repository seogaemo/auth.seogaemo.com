import type { Metadata } from "next";

import { LoginDivider } from "@/components/login/fields";
import { EmailStartForm } from "@/components/login/forms";
import { LoginShell } from "@/components/login/LoginShell";
import { ProviderButton, ProviderIconButton } from "@/components/login/ProviderButton";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { isSocialProvider } from "@/lib/config";
import { loadLoginContext, loadLoginEmail } from "@/lib/login-context";

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

/**
 * 첫 화면. 이메일을 받으면 서버가 다음 단계를 고른다 (비밀번호가 있으면 비밀번호, 없으면 이메일 코드).
 * 이메일 입력이 있으면 소셜 로그인은 정사각형 아이콘 한 줄, 없으면 이름이 보이는 넓은 버튼.
 */
export default async function LoginPage() {
  const { transaction, service, providers, logoUrl } = await loadLoginContext();
  const password = providers.includes("password");
  const emailFirst = password || providers.includes("email");
  const socials = providers.filter(isSocialProvider);

  return (
    <LoginShell branding={service}>
      <ServiceHeading name={service.name} logoUrl={logoUrl} />

      <div className="flex flex-col gap-5">
        {emailFirst && <EmailStartForm defaultEmail={await loadLoginEmail()} canSignup={password} />}

        {socials.length > 0 &&
          (emailFirst ? (
            <>
              <LoginDivider />
              <nav aria-label="소셜 로그인" className="flex justify-center gap-3">
                {socials.map((provider) => (
                  <ProviderIconButton key={provider} provider={provider} />
                ))}
              </nav>
            </>
          ) : (
            <nav aria-label="소셜 로그인" className="flex flex-col gap-2.5">
              {socials.map((provider) => (
                <ProviderButton key={provider} provider={provider} />
              ))}
            </nav>
          ))}

        <p className="text-label text-quaternary">
          {service.name}에 전달되는 정보: {sharedInfo(transaction.scope)}
        </p>
      </div>
    </LoginShell>
  );
}
