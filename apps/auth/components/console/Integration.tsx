import type { Service } from "@prisma/client";
import type { ReactNode } from "react";

import { CodeBlock } from "@/components/console/CodeBlock";
import { CopyField } from "@/components/console/CopyField";
import { IdTokenAlgForm } from "@/components/console/IdTokenAlgForm";
import { RedirectUrisForm } from "@/components/console/RedirectUrisForm";
import { RotateSecret } from "@/components/console/RotateSecret";
import { Block, InfoRow } from "@/components/console/ui";
import { getIssuer } from "@/lib/config";
import { isAppSchemeUrl, isWebUrl, parseUrl } from "@/lib/redirect-uri";
import { getPostLogoutRedirectUris, getRedirectUris, isPublicClient } from "@/lib/service";

function Example({ title, description, open, children }: { title: string; description: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rounded-lg border border-base bg-base-elevated [&[open]]:bg-base">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-footnote font-strong text-primary">{title}</span>
          <span className="text-label text-tertiary">{description}</span>
        </span>
        <svg aria-hidden viewBox="0 0 20 20" width={20} height={20} className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none">
          <path d="M5 8l5 5 5-5" fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" className="text-tertiary" />
        </svg>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

/**
 * 앱을 붙이는 데 필요한 값과, 이 앱의 실제 값(issuer, Client ID, 등록된 Redirect URI)을 채운 복붙용 예제.
 * 연동 화면 전체: 연동 정보, Redirect URI, 예시 코드. 아직 사용자가 없으면(firstRun) 첫 예제를 펼쳐 둔다.
 */
export function Integration({ service, firstRun }: { service: Service; firstRun: boolean }) {
  const issuer = getIssuer();
  const publicClient = isPublicClient(service);
  // 웹 예제는 첫 웹 주소, iOS 예제는 첫 앱 스킴 주소로 채운다
  const uris = getRedirectUris(service).map((uri) => ({ uri, url: parseUrl(uri) }));
  const redirect = uris.find(({ url }) => url && isWebUrl(url))?.uri ?? "https://example.com/callback";
  const webOrigin = new URL(redirect).origin;
  const origin = getPostLogoutRedirectUris(service)[0] ?? webOrigin;
  const es256 = service.idTokenSigningAlg === "ES256";
  // Auth.js(oauth4webapi)는 ID 토큰 서명을 RS256으로 가정하므로 ES256 앱이면 알려 준다
  const clientMetadata = [
    ...(publicClient ? [`token_endpoint_auth_method: "none"`] : []),
    ...(es256 ? [`id_token_signed_response_alg: "ES256"`] : []),
  ];
  const appRedirect = uris.find(({ url }) => url && isAppSchemeUrl(url))?.uri;
  const accountUrl = `${issuer}/account?client_id=${service.clientId}`;

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
${[
  ...(publicClient ? [] : [`      clientSecret: process.env.SEOGAEMO_CLIENT_SECRET,`]),
  ...(clientMetadata.length ? [`      client: { ${clientMetadata.join(", ")} },`] : []),
  `      checks: ["pkce", "state"],`,
].join("\n")}
    },
  ],
});

// Redirect URI로 등록할 주소: ${webOrigin}/api/auth/callback/seogaemo`;

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

  const ios = `// Swift Package: https://github.com/openid/AppAuth-iOS
// 앱에는 Client Secret을 넣지 않는다. 콘솔에서 앱 종류를 "SPA, 모바일 앱"으로 만든 Client ID를 쓴다.
import AppAuth

let issuer = URL(string: "${issuer}")!
let redirectURL = URL(string: "${appRedirect ?? "com.example.app:/oauth/callback"}")!

var currentFlow: OIDExternalUserAgentSession?  // 로그인이 끝날 때까지 들고 있는다

func signIn(from viewController: UIViewController) {
  OIDAuthorizationService.discoverConfiguration(forIssuer: issuer) { config, error in
    guard let config else { return print(error ?? "discovery failed") }
    // PKCE(S256), state, nonce는 AppAuth가 만든다
    let request = OIDAuthorizationRequest(
      configuration: config,
      clientId: "${service.clientId}",
      clientSecret: nil,
      scopes: [OIDScopeOpenID, OIDScopeEmail, OIDScopeProfile],
      redirectURL: redirectURL,
      responseType: OIDResponseTypeCode,
      additionalParameters: nil
    )
    // ASWebAuthenticationSession으로 열린다 (WKWebView 안 됨: Google 로그인, 패스키가 막힌다)
    currentFlow = OIDAuthState.authState(byPresenting: request, presenting: viewController) { state, error in
      guard let state else { return print(error ?? "cancelled") }
      // state를 Keychain에 저장해 두고, API를 부를 때마다 갱신된 토큰을 받는다
      state.performAction { accessToken, idToken, error in
        // Authorization: Bearer \(accessToken!)
      }
    }
  }
}`;

  const prompt = `// 이미 로그인돼 있으면 화면 없이 code를 받는다. 없으면 error=login_required
${issuer}/oauth/authorize?...&prompt=none

// 항상 다시 로그인시킨다
${issuer}/oauth/authorize?...&prompt=login

// "이 계정으로 계속 / 다른 계정" 화면을 보여준다
${issuer}/oauth/authorize?...&prompt=select_account

// 이메일 칸을 미리 채운다
${issuer}/oauth/authorize?...&login_hint=user@example.com`;

  return (
    <>
      <Block title="연동 정보" description="OIDC를 지원하는 라이브러리에 Discovery URL과 Client ID를 넣으면 돼요.">
        <CopyField label="Discovery URL" value={`${issuer}/.well-known/openid-configuration`} />
        <CopyField label="Client ID" value={service.clientId} />
        {publicClient ? (
          <InfoRow label="Client Secret">
            <span className="text-footnote text-quaternary">SPA, 모바일 앱은 Client Secret을 쓰지 않아요 (PKCE만 사용)</span>
          </InfoRow>
        ) : (
          <RotateSecret serviceId={service.id} />
        )}
        <CopyField label="계정 화면" value={accountUrl} />
        <IdTokenAlgForm serviceId={service.id} alg={service.idTokenSigningAlg} />
      </Block>

      <Block title="주소" description="로그인과 로그아웃이 끝나면 돌아갈 주소예요. 웹은 https 주소, iOS와 Android 앱은 com.example.app:/oauth/callback 같은 앱 스킴을 등록해요.">
        <RedirectUrisForm
          serviceId={service.id}
          redirectUris={getRedirectUris(service)}
          postLogoutRedirectUris={getPostLogoutRedirectUris(service)}
        />
      </Block>

      <Block title="예시 코드" description="이 앱의 값을 채워 뒀어요. 복사해서 그대로 쓰면 돼요.">
        <div className="flex flex-col gap-2">
          <Example
            title="Next.js (Auth.js)"
            description={publicClient ? "Client Secret 없이 PKCE만 써요." : "Client Secret은 환경 변수에 두세요."}
            open={firstRun}
          >
            <CodeBlock title="auth.ts" code={authjs} />
          </Example>
          <Example title="SPA (React, Vue 등)" description="oidc-client-ts가 PKCE와 토큰 갱신을 알아서 해요.">
            <CodeBlock title="auth.ts" code={spa} />
          </Example>
          <Example
            title="iOS (Swift)"
            description={
              appRedirect
                ? "AppAuth가 PKCE, 토큰 교환, 갱신을 해요. 위에 등록한 앱 스킴으로 채웠어요."
                : "AppAuth가 PKCE, 토큰 교환, 갱신을 해요. Redirect URI에 com.example.app:/oauth/callback처럼 앱 스킴을 먼저 등록하세요."
            }
          >
            <CodeBlock title="SignIn.swift" code={ios} />
          </Example>
          <Example title="로그인 유지와 prompt" description="한 번 로그인하면 30일 동안 로그인 화면 없이 넘어가요.">
            <CodeBlock title="authorize 옵션" code={prompt} />
          </Example>
          <Example title="계정 화면 링크" description="비밀번호 변경, 기기 관리, 탈퇴. 앱의 설정 메뉴에 걸어 주세요.">
            <CodeBlock title="링크" code={`<a href="${accountUrl}">계정 관리</a>`} />
          </Example>
        </div>
      </Block>
    </>
  );
}
