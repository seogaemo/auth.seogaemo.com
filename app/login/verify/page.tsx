import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { VerifyCodeForm } from "@/components/login/forms";
import { LoginShell } from "@/components/login/LoginShell";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { EMAIL_CODE_COOKIE } from "@/lib/config";
import { findPendingCode } from "@/lib/email-auth";
import { loadLoginContext } from "@/lib/login-context";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "메일 확인" };

const ACTION = { signup: "가입하기", login: "로그인하기", reset: "비밀번호 재설정" } as const;

export default async function VerifyPage() {
  const { transaction, service, logoUrl } = await loadLoginContext();
  const record = await findPendingCode((await cookies()).get(EMAIL_CODE_COOKIE)?.value, transaction.id);
  if (!record) redirect("/login");

  const purpose = record.purpose as keyof typeof ACTION;

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={logoUrl}
        action={ACTION[purpose]}
        description={
          <>
            <span className="font-strong text-primary">{record.email}</span>
            <span className="text-secondary">로 보낸 6자리 코드를 입력하세요. 10분 동안 쓸 수 있어요.</span>
          </>
        }
      />
      <VerifyCodeForm needsNewPassword={purpose === "reset"} />
    </LoginShell>
  );
}
