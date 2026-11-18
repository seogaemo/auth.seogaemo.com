import type { Service } from "@prisma/client";
import type { ReactNode } from "react";

import { AiPrompt } from "@/components/console/AiPrompt";
import { CodeBlock } from "@/components/console/CodeBlock";
import { CopyField } from "@/components/console/CopyField";
import { TokenSettingsForm } from "@/components/console/TokenSettingsForm";
import { RedirectUrisForm } from "@/components/console/RedirectUrisForm";
import { RotateSecret } from "@/components/console/RotateSecret";
import { Block, InfoRow } from "@/components/console/ui";
import { getIssuer } from "@/lib/config";
import { isAppSchemeUrl, parseUrl } from "@/lib/redirect-uri";
import { appFacts, appPrompt, examples } from "@/lib/integration-guide";
import { getPostLogoutRedirectUris, getRedirectUris } from "@/lib/service";

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
  const facts = appFacts(service);
  const { publicClient, accountUrl } = facts;
  const appRedirectRegistered = getRedirectUris(service).some((uri) => {
    const url = parseUrl(uri);
    return url && isAppSchemeUrl(url);
  });
  const ex = examples(facts);
  const ai = appPrompt(service, { hasUsers: !firstRun });

  return (
    <>
      <Block title="AI에게 맡기기" description="AI 코딩 도구로 개발한다면 이 안내를 붙여 넣으세요.">
        <AiPrompt prompt={ai.prompt} todoCount={ai.todoCount} />
      </Block>

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
        <TokenSettingsForm serviceId={service.id} alg={service.idTokenSigningAlg} graceSec={service.refreshTokenGraceSec} />
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
            <div className="flex flex-col gap-2">
              {ex.authjsFiles.map((file) => (
                <CodeBlock key={file.title} title={file.title} code={file.code} />
              ))}
            </div>
          </Example>
          {!publicClient && (
            <Example title="그 밖의 서버 (Express, Hono 등)" description="openid-client v6. 세션에 verifier, state, nonce를 두세요.">
              <CodeBlock title="auth.ts" code={ex.server} />
            </Example>
          )}
          <Example title="SPA (React, Vue 등)" description="oidc-client-ts가 PKCE와 토큰 갱신을 알아서 해요.">
            <CodeBlock title="auth.ts" code={ex.spa} />
          </Example>
          <Example
            title="iOS (Swift)"
            description={
              appRedirectRegistered
                ? "AppAuth가 PKCE, 토큰 교환, 갱신을 해요. 위에 등록한 앱 스킴으로 채웠어요."
                : "AppAuth가 PKCE, 토큰 교환, 갱신을 해요. Redirect URI에 com.example.app:/oauth/callback처럼 앱 스킴을 먼저 등록하세요."
            }
          >
            <CodeBlock title="SignIn.swift" code={ex.ios} />
          </Example>
          <Example
            title="Android (Kotlin)"
            description={
              appRedirectRegistered
                ? "AppAuth가 PKCE, 토큰 교환, 갱신을 해요. 위에 등록한 앱 스킴으로 채웠어요."
                : "AppAuth가 PKCE, 토큰 교환, 갱신을 해요. Redirect URI에 com.example.app:/oauth/callback처럼 앱 스킴을 먼저 등록하세요."
            }
          >
            <CodeBlock title="SignIn.kt" code={ex.android} />
          </Example>
          <Example title="로그인 유지와 prompt" description="한 번 로그인하면 30일 동안 로그인 화면 없이 넘어가요.">
            <CodeBlock title="authorize 옵션" code={ex.prompt} />
          </Example>
          <Example title="계정 화면 링크" description="비밀번호 변경, 기기 관리, 탈퇴. 앱의 설정 메뉴에 걸어 주세요.">
            <CodeBlock title="링크" code={ex.accountLink} />
          </Example>
        </div>
      </Block>
    </>
  );
}
