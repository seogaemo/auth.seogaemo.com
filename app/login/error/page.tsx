import type { Metadata } from "next";

import { LoginShell } from "@/components/login/LoginShell";
import { isLoginErrorCode, LOGIN_ERRORS } from "@/lib/oauth/errors";

export const metadata: Metadata = { title: "로그인할 수 없어요" };

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const message = isLoginErrorCode(code) ? LOGIN_ERRORS[code] : "로그인 중 문제가 생겼어요.";

  return (
    <LoginShell>
      <div role="alert" className="flex flex-col gap-2">
        <h1 className="font-mono text-[24px] font-[450] leading-[1.35] tracking-[-0.04em] text-black">
          로그인할 수 없어요
        </h1>
        <p className="text-footnote text-secondary">{message}</p>
      </div>
    </LoginShell>
  );
}
