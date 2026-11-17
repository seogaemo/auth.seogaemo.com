import type { Metadata } from "next";

import { LoginButton, LoginTextLink } from "@/components/login/fields";
import { LoginShell } from "@/components/login/LoginShell";
import { findServiceByClientId, isAllowedPostLogoutUri, serviceHomeUrl } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "로그아웃" };

/**
 * id_token_hint 없이 로그아웃 요청이 왔을 때 묻는 화면 (RP-Initiated Logout 2).
 * 로그아웃을 누르면 같은 값으로 /oauth/logout에 POST한다 (같은 origin이라 바로 처리된다).
 */
export default async function LogoutConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; post_logout_redirect_uri?: string; state?: string }>;
}) {
  const { client_id: clientId, post_logout_redirect_uri: postLogout, state } = await searchParams;
  const service = clientId ? await findServiceByClientId(clientId) : null;
  // 취소하면 돌아갈 곳: 등록된 로그아웃 후 주소, 아니면 앱 첫 화면
  const back = service && postLogout && isAllowedPostLogoutUri(service, postLogout) ? postLogout : service ? serviceHomeUrl(service) : null;

  return (
    <LoginShell branding={service ?? undefined}>
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-[24px] font-[450] leading-[1.35] tracking-[-0.04em] text-black">로그아웃할까요?</h1>
        <p className="text-footnote text-secondary">
          {service
            ? `이 브라우저에서 ${service.name} 로그인을 끝내요. 다음에는 다시 로그인해야 해요.`
            : "이 브라우저의 Seogaemo 로그인을 모두 끝내요. 로그인한 앱마다 다시 로그인해야 해요."}
        </p>
      </div>
      <form action="/oauth/logout" method="post" className="flex flex-col gap-3">
        {service && <input type="hidden" name="client_id" value={service.clientId} />}
        {postLogout && <input type="hidden" name="post_logout_redirect_uri" value={postLogout} />}
        {state && <input type="hidden" name="state" value={state} />}
        <LoginButton type="submit">로그아웃</LoginButton>
      </form>
      {back && (
        <div className="flex justify-center">
          <LoginTextLink href={back}>로그아웃하지 않고 돌아가기</LoginTextLink>
        </div>
      )}
    </LoginShell>
  );
}
