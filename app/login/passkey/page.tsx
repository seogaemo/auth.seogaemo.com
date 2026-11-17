import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginShell } from "@/components/login/LoginShell";
import { PasskeyPrompt } from "@/components/login/PasskeyPrompt";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { loadLoginContext } from "@/lib/login-context";
import { passkeyAvailable } from "@/lib/passkey";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "패스키 저장" };

/**
 * 이메일 코드, 비밀번호 로그인과 가입 직후의 패스키 저장 제안.
 * 로그인을 확인한 사용자(LoginTransaction.verifiedUserId)만 들어올 수 있다. 저장하든 건너뛰든 여기서 로그인을 마친다.
 */
export default async function PasskeyPage() {
  const { transaction, service, providers, logoUrl } = await loadLoginContext();
  if (!transaction.verifiedUserId || !passkeyAvailable(providers)) redirect("/login");

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={logoUrl}
        title={
          <>
            패스키를
            <br />
            저장할까요?
          </>
        }
        description="지문, 얼굴, 화면 잠금으로 다음부터 코드나 비밀번호 없이 로그인할 수 있어요. 한 번 저장하면 모든 Seogaemo 서비스에서 쓸 수 있어요."
      />
      <PasskeyPrompt />
    </LoginShell>
  );
}
