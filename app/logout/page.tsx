import type { Metadata } from "next";

import { LoginTextLink } from "@/components/login/fields";
import { LoginShell } from "@/components/login/LoginShell";
import { findServiceByClientId, serviceHomeUrl } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "로그아웃" };

const ERRORS: Record<string, string> = {
  invalid_hint: "로그아웃 요청을 확인하지 못했어요. 이 브라우저의 로그인은 그대로예요.",
  invalid_client: "등록되지 않은 서비스의 로그아웃 요청이에요.",
  invalid_redirect: "로그아웃은 했지만, 요청한 주소가 서비스에 등록된 주소가 아니라서 이 화면에 머물렀어요.",
};

export default async function LogoutPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; error?: string }>;
}) {
  const { client_id: clientId, error } = await searchParams;
  const service = clientId ? await findServiceByClientId(clientId) : null;
  const home = service ? serviceHomeUrl(service) : null;
  const failed = error === "invalid_hint" || error === "invalid_client";

  return (
    <LoginShell branding={service ?? undefined}>
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-[24px] font-[450] leading-[1.35] tracking-[-0.04em] text-black">
          {failed ? "로그아웃하지 못했어요" : "로그아웃했어요"}
        </h1>
        <p className="text-footnote text-secondary">
          {error && ERRORS[error]
            ? ERRORS[error]
            : service
              ? `이 브라우저에서 ${service.name} 로그인이 끝났어요. 다음에는 다시 로그인해야 해요.`
              : "이 브라우저의 Seogaemo 로그인이 모두 끝났어요."}
        </p>
        {home && service && (
          <div className="pt-2">
            <LoginTextLink href={home}>{service.name} 열기 →</LoginTextLink>
          </div>
        )}
      </div>
    </LoginShell>
  );
}
