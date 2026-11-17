import { CodeBlock } from "@/components/console/CodeBlock";
import { CopyField } from "@/components/console/CopyField";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Block, Page } from "@/components/console/ui";
import { getIssuer } from "@/lib/config";
import { requireServiceAccess } from "@/lib/console/session";
import { getRedirectUris, isPublicClient } from "@/lib/service";

export const metadata = { title: "연동 가이드" };

/** 실제 값(issuer, Client ID, 등록된 Redirect URI)을 채운 복붙용 예제 */
export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const issuer = getIssuer();
  const publicClient = isPublicClient(service);
  const redirect = getRedirectUris(service)[0] ?? "https://example.com/callback";
  const origin = (() => {
    try {
      return new URL(redirect).origin;
    } catch {
      return "https://example.com";
    }
  })();

  const authjs = `// auth.ts (Next.js, Auth.js v5)
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "seogaemo",
      name: "Seogaemo",
      type: "oidc",
      issuer: "${issuer}",
      clientId: "${service.clientId}",
${publicClient ? `      client: { token_endpoint_auth_method: "none" },` : `      clientSecret: process.env.SEOGAEMO_CLIENT_SECRET,`}
      checks: ["pkce", "state"],
    },
  ],
});

// Redirect URI로 등록할 주소: ${origin}/api/auth/callback/seogaemo`;

  const spa = `// SPA (oidc-client-ts)
import { UserManager } from "oidc-client-ts";

export const auth = new UserManager({
  authority: "${issuer}",
  client_id: "${service.clientId}",
  redirect_uri: "${redirect}",
  post_logout_redirect_uri: "${origin}",
  scope: "openid email profile",
});

// 로그인 버튼
await auth.signinRedirect();

// redirect_uri 페이지에서
const user = await auth.signinRedirectCallback();
console.log(user.profile.email);

// 로그아웃 (Seogaemo 로그인도 끝나고 앱으로 돌아온다)
await auth.signoutRedirect();`;

  const silent = `// 이미 로그인돼 있으면 화면 없이 code를 받는다. 없으면 error=login_required
${issuer}/oauth/authorize?...&prompt=none

// 항상 다시 로그인시킨다
${issuer}/oauth/authorize?...&prompt=login

// "이 계정으로 계속 / 다른 계정" 화면을 보여준다
${issuer}/oauth/authorize?...&prompt=select_account

// 이메일 칸을 미리 채운다
${issuer}/oauth/authorize?...&login_hint=user@example.com`;

  return (
    <Page wide>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="연동 가이드" />

        <Block title="주소" description="표준 OIDC라서 대부분의 라이브러리는 Discovery URL과 Client ID만 있으면 돼요.">
          <CopyField label="Discovery URL" value={`${issuer}/.well-known/openid-configuration`} />
          <CopyField label="Client ID" value={service.clientId} />
          <CopyField label="로그아웃" value={`${issuer}/oauth/logout`} />
          <CopyField label="계정 화면" value={`${issuer}/account?client_id=${service.clientId}`} />
        </Block>

        <Block
          title="Next.js (Auth.js)"
          description={publicClient ? "SPA, 모바일 앱이라 Client Secret 없이 PKCE만 써요." : "Client Secret은 환경 변수에 두세요. 코드에 넣지 마세요."}
        >
          <CodeBlock title="auth.ts" code={authjs} />
        </Block>

        <Block title="SPA (React, Vue 등)" description="oidc-client-ts를 쓰면 PKCE와 토큰 갱신을 알아서 해요.">
          <CodeBlock title="auth.ts" code={spa} />
        </Block>

        <Block title="로그인 유지와 prompt" description="한 번 로그인하면 30일 동안 이 브라우저에서는 로그인 화면 없이 넘어가요.">
          <CodeBlock title="authorize 옵션" code={silent} />
        </Block>

        <Block title="계정 화면" description="사용자가 비밀번호 변경, 로그인된 기기 관리, 탈퇴를 할 수 있는 화면이에요. 앱의 설정 메뉴에 링크로 걸어 주세요.">
          <CodeBlock title="링크" code={`<a href="${issuer}/account?client_id=${service.clientId}">계정 관리</a>`} />
        </Block>
      </div>
    </Page>
  );
}
