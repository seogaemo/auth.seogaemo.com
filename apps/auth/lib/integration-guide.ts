/**
 * 연동 안내의 원본. 콘솔 예시 코드, "AI에게 맡기기" 프롬프트, /llms.txt, /llms-full.txt가 모두 여기서 나온다.
 * 서버 동작(지원하는 파라미터, 주소 규칙)이 바뀌면 여기를 같이 고친다.
 */
import type { Service } from "@prisma/client";

import { getIssuer, PROVIDERS, type Provider } from "./config";
import { PROVIDER_META } from "./provider-meta";
import { isAppSchemeUrl, isWebUrl, parseUrl } from "./redirect-uri";
import { getPostLogoutRedirectUris, getProviders, getRedirectUris, isPublicClient } from "./service";

/** 예시 코드를 채울 값. 실제 앱이면 그 앱의 값, 공개 문서면 자리 표시 값 */
export interface AppFacts {
  issuer: string;
  name: string;
  clientId: string;
  publicClient: boolean;
  /** 예시에 쓸 웹 콜백 주소 (등록된 첫 웹 주소, 없으면 예시) */
  webRedirect: string;
  webOrigin: string;
  /** 로그아웃 뒤 돌아갈 주소 (등록된 첫 값, 없으면 웹 origin) */
  postLogout: string;
  /** 예시에 쓸 앱 스킴 콜백 (등록된 첫 앱 스킴, 없으면 예시) */
  appRedirect: string;
  alg: "RS256" | "ES256";
  graceSec: number;
  redirectUris: string[];
  postLogoutUris: string[];
  providers: Provider[];
  accountUrl: string;
  /** 이 앱의 콘솔 연동 화면 (실제 앱만) */
  consoleUrl?: string;
  /** 실제 앱의 값이 아니라 자리 표시 값인지 */
  placeholder: boolean;
}


export function appFacts(service: Service): AppFacts {
  const issuer = getIssuer();
  const redirectUris = getRedirectUris(service);
  const parsed = redirectUris.map((uri) => ({ uri, url: parseUrl(uri) }));
  const webRedirect = parsed.find(({ url }) => url && isWebUrl(url))?.uri ?? "https://example.com/api/auth/callback/seogaemo";
  const webOrigin = new URL(webRedirect).origin;
  const postLogoutUris = getPostLogoutRedirectUris(service);
  return {
    issuer,
    name: service.name,
    clientId: service.clientId,
    publicClient: isPublicClient(service),
    webRedirect,
    webOrigin,
    postLogout: postLogoutUris[0] ?? webOrigin,
    appRedirect: parsed.find(({ url }) => url && isAppSchemeUrl(url))?.uri ?? "com.example.app:/oauth/callback",
    alg: service.idTokenSigningAlg === "ES256" ? "ES256" : "RS256",
    graceSec: service.refreshTokenGraceSec,
    redirectUris,
    postLogoutUris,
    providers: getProviders(service),
    accountUrl: `${issuer}/account?client_id=${service.clientId}`,
    consoleUrl: `${issuer}/console/services/${service.id}/integration`,
    placeholder: false,
  };
}

/** 공개 문서용 자리 표시 값 */
export function placeholderFacts(): AppFacts {
  const issuer = getIssuer();
  return {
    issuer,
    name: "내 앱",
    clientId: "YOUR_CLIENT_ID",
    publicClient: false,
    webRedirect: "https://app.example.com/api/auth/callback/seogaemo",
    webOrigin: "https://app.example.com",
    postLogout: "https://app.example.com",
    appRedirect: "com.example.app:/oauth/callback",
    alg: "RS256",
    graceSec: 30,
    redirectUris: [],
    postLogoutUris: [],
    providers: [...PROVIDERS],
    accountUrl: `${issuer}/account?client_id=YOUR_CLIENT_ID`,
    placeholder: true,
  };
}

/** 스택별 예시 코드. 콘솔과 AI 안내가 같은 코드를 쓴다 */
export function examples(f: AppFacts) {
  // Auth.js(oauth4webapi)는 ID 토큰 서명을 RS256으로 가정하므로 ES256 앱이면 알려 준다
  const clientMetadata = [
    ...(f.publicClient ? [`token_endpoint_auth_method: "none"`] : []),
    ...(f.alg === "ES256" ? [`id_token_signed_response_alg: "ES256"`] : []),
  ];

  const authjs = `// auth.ts (Next.js, Auth.js v5)
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "seogaemo",
      name: "Seogaemo",
      type: "oidc",
      issuer: "${f.issuer}",
      clientId: "${f.clientId}",
${[
  ...(f.publicClient ? [] : [`      clientSecret: process.env.SEOGAEMO_CLIENT_SECRET,`]),
  ...(clientMetadata.length ? [`      client: { ${clientMetadata.join(", ")} },`] : []),
  `      checks: ["pkce", "state"],`,
].join("\n")}
    },
  ],
});

// app/api/auth/[...nextauth]/route.ts
// export const { GET, POST } = handlers;

// Redirect URI로 등록할 주소: ${f.webOrigin}/api/auth/callback/seogaemo`;

  const spa = `// SPA (oidc-client-ts)
import { UserManager } from "oidc-client-ts";

export const auth = new UserManager({
  authority: "${f.issuer}",
  client_id: "${f.clientId}",
  redirect_uri: "${f.webRedirect}",
  post_logout_redirect_uri: "${f.postLogout}",
  scope: "openid email profile",
});

// 로그인 버튼
await auth.signinRedirect();

// redirect_uri 페이지에서
const user = await auth.signinRedirectCallback();
console.log(user.profile.email);

// 로그아웃 (Seogaemo 로그인도 끝나고 앱으로 돌아온다)
await auth.signoutRedirect();`;

  const server = `// 그 밖의 서버 (Express, Hono, Fastify 등). openid-client v6
import * as client from "openid-client";

const config = await client.discovery(
  new URL("${f.issuer}"),
  "${f.clientId}",
  ${f.alg === "ES256" ? `{ id_token_signed_response_alg: "ES256" }` : "undefined"},
  ${f.publicClient ? "client.None()" : "client.ClientSecretBasic(process.env.SEOGAEMO_CLIENT_SECRET!)"},
);

// 로그인 시작: verifier, state, nonce를 세션(서버 쪽)에 저장하고 url로 보낸다
const verifier = client.randomPKCECodeVerifier();
const state = client.randomState();
const nonce = client.randomNonce();
const url = client.buildAuthorizationUrl(config, {
  redirect_uri: "${f.webRedirect}",
  scope: "openid email profile",
  code_challenge: await client.calculatePKCECodeChallenge(verifier),
  code_challenge_method: "S256",
  state,
  nonce,
});

// 콜백: 요청 주소 전체를 넘긴다 (state, iss 확인과 ID 토큰 검증을 라이브러리가 한다)
const tokens = await client.authorizationCodeGrant(config, new URL(callbackRequestUrl), {
  pkceCodeVerifier: verifier,
  expectedState: state,
  expectedNonce: nonce,
});
const claims = tokens.claims(); // { sub, email, name, ... }

// 로그아웃: refresh token 폐기 후 브라우저를 이 주소로 보낸다
const logoutUrl = client.buildEndSessionUrl(config, {
  id_token_hint: tokens.id_token!,
  post_logout_redirect_uri: "${f.postLogout}",
});`;

  const ios = `// Swift Package: https://github.com/openid/AppAuth-iOS
// 앱에는 Client Secret을 넣지 않는다. 콘솔에서 앱 종류를 "SPA, 모바일 앱"으로 만든 Client ID를 쓴다.
import AppAuth

let issuer = URL(string: "${f.issuer}")!
let redirectURL = URL(string: "${f.appRedirect}")!

var currentFlow: OIDExternalUserAgentSession?  // 로그인이 끝날 때까지 들고 있는다

func signIn(from viewController: UIViewController) {
  OIDAuthorizationService.discoverConfiguration(forIssuer: issuer) { config, error in
    guard let config else { return print(error ?? "discovery failed") }
    // PKCE(S256), state, nonce는 AppAuth가 만든다
    let request = OIDAuthorizationRequest(
      configuration: config,
      clientId: "${f.clientId}",
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
        // Authorization: Bearer \\(accessToken!)
      }
    }
  }
}`;

  const scheme = f.appRedirect.split(":")[0];
  const android = `// build.gradle.kts
// dependencies { implementation("net.openid:appauth:0.11.1") }
// android { defaultConfig { manifestPlaceholders["appAuthRedirectScheme"] = "${scheme}" } }
// 앱에는 Client Secret을 넣지 않는다. 콘솔에서 앱 종류를 "SPA, 모바일 앱"으로 만든 Client ID를 쓴다.
import net.openid.appauth.*

val authService = AuthorizationService(context)

// 로그인: Custom Tabs로 열린다 (WebView 안 됨: Google 로그인, 패스키가 막힌다)
AuthorizationServiceConfiguration.fetchFromIssuer(Uri.parse("${f.issuer}")) { config, ex ->
  if (config == null) return@fetchFromIssuer
  // PKCE(S256), state, nonce는 AppAuth가 만든다
  val request = AuthorizationRequest.Builder(config, "${f.clientId}", ResponseTypeValues.CODE, Uri.parse("${f.appRedirect}"))
    .setScopes("openid", "email", "profile")
    .build()
  loginLauncher.launch(authService.getAuthorizationRequestIntent(request))
}

// 결과 (ActivityResultLauncher 콜백)
val response = AuthorizationResponse.fromIntent(data)
authService.performTokenRequest(response!!.createTokenExchangeRequest()) { tokens, ex ->
  // AuthState에 담아 EncryptedSharedPreferences 등에 저장하고, performActionWithFreshTokens로 갱신된 토큰을 쓴다
}`;

  const prompt = `// 이미 로그인돼 있으면 화면 없이 code를 받는다. 없으면 error=login_required
${f.issuer}/oauth/authorize?...&prompt=none

// 항상 다시 로그인시킨다
${f.issuer}/oauth/authorize?...&prompt=login

// "이 계정으로 계속 / 다른 계정" 화면을 보여준다
${f.issuer}/oauth/authorize?...&prompt=select_account

// 이메일 칸을 미리 채운다
${f.issuer}/oauth/authorize?...&login_hint=user@example.com`;

  const accountLink = `<a href="${f.accountUrl}">계정 관리</a>`;

  return { authjs, spa, server, ios, android, prompt, accountLink };
}

/** 표준 동작 요약. 공개 문서와 AI 프롬프트에 같이 들어간다 */
function rules(f: AppFacts) {
  return `## 서버 규칙 (이대로 동작한다)

- 프로토콜: OpenID Connect + OAuth 2.0. Authorization Code 흐름만 지원하고 PKCE(S256)가 필수다. implicit, password grant는 없다.
- 주소
  - Issuer: ${f.issuer}
  - Discovery: ${f.issuer}/.well-known/openid-configuration (라이브러리에는 이 주소나 issuer만 넣으면 된다)
  - authorize: ${f.issuer}/oauth/authorize (GET, POST)
  - token: ${f.issuer}/oauth/token
  - userinfo: ${f.issuer}/oauth/userinfo
  - revocation: ${f.issuer}/oauth/revoke (RFC 7009, refresh token만 폐기할 수 있다)
  - end session: ${f.issuer}/oauth/logout (RP-Initiated Logout)
  - JWKS: ${f.issuer}/.well-known/jwks.json (CORS 열림)
- scope: openid, email, profile. 클레임은 sub(앱마다 다른 사용자 ID), email, email_verified, name, preferred_username, picture.
- redirect_uri는 콘솔에 등록한 값과 글자 하나까지 같아야 한다 (끝의 /, 포트, 경로 포함). 웹은 https만, 개발용 localhost는 http도 된다. 네이티브 앱은 com.example.app:/oauth/callback 같은 역도메인 스킴. 127.0.0.1, [::1] 루프백은 포트만 달라도 된다.
- 인가 응답에 iss가 붙는다 (RFC 9207). 응답은 query로만 온다 (response_mode=query).
- 클라이언트 인증: 서버가 있는 웹앱은 client_secret_basic 또는 client_secret_post, SPA와 모바일 앱(public client)은 none(PKCE만). public client가 시크릿을 보내면 거절된다.
- ID 토큰 서명은 앱마다 RS256 또는 ES256 (콘솔 연동 > 토큰 설정). ES256이면 라이브러리에 id_token_signed_response_alg: "ES256"을 알려야 하는 경우가 있다 (Auth.js, openid-client).
- 토큰: access token은 1시간짜리 JWT (aud = client_id). refresh token은 30일, 쓸 때마다 새 것으로 바뀐다(회전). 응답의 새 refresh token을 저장하고 이전 것은 버린다. 바뀐 지 ${f.graceSec}초가 지난 이전 토큰을 다시 쓰면 탈취로 보고 그 사용자의 토큰을 모두 끊는다.
- 로그인 유지: 한 번 로그인하면 30일 동안 로그인 화면 없이 넘어간다. prompt=none, login, select_account, consent와 max_age, login_hint를 지원한다.
- 로그아웃: refresh token을 폐기(revoke)한 뒤 브라우저를 end session으로 보낸다. id_token_hint를 꼭 붙인다 (없으면 "로그아웃할까요?" 확인 화면이 뜬다). post_logout_redirect_uri는 콘솔에 등록한 "로그아웃 후 이동 주소"와 정확히 같아야 앱으로 돌아온다.
- 네이티브 앱은 ASWebAuthenticationSession(iOS), Custom Tabs(Android)로 연다. WebView 안에서 열면 Google 로그인과 패스키가 막힌다.
- 계정 관리(비밀번호, 기기, 탈퇴) 화면: ${f.accountUrl}

## 자주 틀리는 것

- invalid_redirect_uri 오류 화면: 요청한 redirect_uri가 등록값과 다르다. 프레임워크가 실제로 쓰는 콜백 경로를 확인하고 그대로 등록한다.
- "unexpected JWT alg" 같은 오류: 앱의 ID 토큰 서명(RS256/ES256)과 라이브러리 설정이 다르다.
- invalid_client: public client인데 시크릿을 보냈거나, 서버 앱인데 시크릿이 틀렸다.
- 로그아웃 뒤 Seogaemo 화면에 머문다: post_logout_redirect_uri가 등록되지 않았다.
- 탭 여러 개에서 갑자기 로그아웃된다: 갱신한 refresh token을 저장하지 않고 이전 것을 계속 쓰고 있다.`;
}

/** /llms-full.txt: AI가 읽는 전체 연동 문서 */
export function fullGuide() {
  const f = placeholderFacts();
  const ex = examples(f);
  return `# Seogaemo SSO 연동 안내

> Seogaemo SSO(${f.issuer})는 누구나 자기 앱에 "Seogaemo로 로그인"을 붙일 수 있는 OpenID Connect 서버다. 사용자는 이메일, 이메일 코드, 패스키, Google, 카카오로 로그인한다. 이 문서는 AI 코딩 도구가 그대로 따라 붙일 수 있게 쓴 것이다.

## 코드를 짜기 전에 (콘솔에서 사람이 할 일)

1. ${f.issuer}/console 에 로그인해 앱을 만든다.
   - 앱 종류: 서버가 있는 웹앱(Next.js 서버, Express 등)은 "서버가 있는 웹앱"(Client Secret 발급), SPA와 모바일 앱은 "SPA, 모바일 앱"(시크릿 없음, PKCE만).
   - Client Secret은 만들 때 한 번만 보인다. 잃어버리면 연동 화면에서 새로 발급한다. 코드에 넣지 말고 환경 변수(SEOGAEMO_CLIENT_SECRET)에 둔다.
2. 연동 > 주소 > Redirect URI에 앱의 콜백 주소를 등록한다 (개발용, 운영용 모두).
3. 연동 > 주소 > 로그아웃 후 이동 주소에 로그아웃 뒤 돌아올 주소를 등록한다.
4. 연동 화면의 "AI에게 맡기기"를 누르면 이 앱의 실제 값이 채워진 안내가 복사된다. 이 문서보다 그쪽이 정확하다.

${rules(f)}

## 예시 코드

YOUR_CLIENT_ID, app.example.com, com.example.app은 실제 값으로 바꾼다.

### Next.js (Auth.js v5)

\`\`\`ts
${ex.authjs}
\`\`\`

### SPA (React, Vue 등, oidc-client-ts)

\`\`\`ts
${ex.spa}
\`\`\`

### 그 밖의 서버 (openid-client v6)

\`\`\`ts
${ex.server}
\`\`\`

### iOS (AppAuth-iOS)

\`\`\`swift
${ex.ios}
\`\`\`

### Android (AppAuth-Android)

\`\`\`kotlin
${ex.android}
\`\`\`

### authorize 옵션

\`\`\`text
${ex.prompt}
\`\`\`
`;
}

/** /llms.txt: llmstxt.org 형식의 안내 목록 */
export function llmsIndex() {
  const issuer = getIssuer();
  return `# Seogaemo SSO

> 자기 앱에 "Seogaemo로 로그인"을 붙이는 OpenID Connect 서버. Authorization Code + PKCE, Discovery, RS256/ES256 ID 토큰, refresh token 회전, RP-Initiated Logout을 지원한다. 일반 OIDC 라이브러리(Auth.js, oidc-client-ts, openid-client, AppAuth)로 붙는다.

Issuer는 ${issuer}, Discovery는 ${issuer}/.well-known/openid-configuration 이다. 앱 등록과 Redirect URI 등록은 ${issuer}/console 에서 사람이 한다.

## Docs

- [전체 연동 안내](${issuer}/llms-full.txt): 콘솔에서 할 일, 서버 규칙, 자주 틀리는 것, 스택별 예시 코드 (Next.js, SPA, Node 서버, iOS, Android)
- [OpenID 설정](${issuer}/.well-known/openid-configuration): 엔드포인트와 지원 기능 (JSON)

## Optional

- [콘솔](${issuer}/console): 앱 만들기, Client ID와 Secret, Redirect URI, 로그인 화면 꾸미기
`;
}

/** 콘솔의 "AI에게 맡기기": 이 앱의 실제 값과 아직 안 된 설정에 대한 지시를 담은 프롬프트 */
export function appPrompt(service: Service, options: { hasUsers: boolean }): { prompt: string; todoCount: number } {
  const f = appFacts(service);
  const ex = examples(f);
  const webUris = f.redirectUris.filter((u) => {
    const url = parseUrl(u);
    return url && isWebUrl(url);
  });
  const appUris = f.redirectUris.filter((u) => {
    const url = parseUrl(u);
    return url && isAppSchemeUrl(url);
  });

  const todo: string[] = [];
  if (f.redirectUris.length === 0) {
    todo.push(
      `Redirect URI가 하나도 등록돼 있지 않다. 이대로는 로그인이 invalid_redirect_uri 오류로 멈춘다. 코드를 쓰기 전에 사용자에게 앱의 개발 주소와 운영 주소(예: http://localhost:3000, https://myapp.com)를 묻고, 쓰기로 한 라이브러리의 실제 콜백 경로로 등록할 주소를 정확히 적어 준 뒤, ${f.consoleUrl} 의 "주소 > Redirect URI"에 붙여 넣고 저장하라고 안내하라. (Auth.js라면 {주소}/api/auth/callback/seogaemo, 네이티브 앱이라면 com.회사도메인.앱이름:/oauth/callback 형식)`,
    );
  }
  if (webUris.length > 0 && f.postLogoutUris.length === 0) {
    todo.push(
      `로그아웃 후 이동 주소가 없다. 로그아웃하면 앱으로 돌아오지 못하고 Seogaemo 화면에 머문다. 코드에서 쓸 post_logout_redirect_uri(예: ${new URL(webUris[0]!).origin})를 정하고, ${f.consoleUrl} 의 "주소 > 로그아웃 후 이동 주소"에 등록하라고 안내하라.`,
    );
  }
  if (!f.publicClient) {
    todo.push(
      `이 앱은 "서버가 있는 웹앱"이라 Client Secret이 필요하다. 시크릿은 이 안내에 들어 있지 않다. 사용자에게 시크릿을 환경 변수 SEOGAEMO_CLIENT_SECRET에 넣어 달라고 하라. 시크릿을 잃어버렸으면 ${f.consoleUrl} 의 "Client Secret > 새로 발급하기"에서 새로 받을 수 있다 (한 번만 보이고, 새로 발급하면 이전 시크릿은 바로 못 쓴다). 시크릿을 코드, 커밋, 브라우저 번들에 넣지 마라.`,
    );
  } else {
    todo.push(
      `이 앱은 public client(SPA, 모바일)라 Client Secret이 없다. 토큰 요청에 시크릿을 보내면 invalid_client로 거절된다. 만들려는 것이 서버에서 토큰을 받는 웹앱이면, 사용자에게 콘솔에서 "서버가 있는 웹앱" 종류로 앱을 새로 만들자고 제안하라.`,
    );
  }
  if (f.providers.length === 0) {
    todo.push(`켜진 로그인 방식이 없어 로그인 화면이 오류로 멈춘다. 사용자에게 ${f.issuer}/console 의 "로그인 화면 > 이름과 로그인 방식"에서 하나 이상 켜라고 안내하라.`);
  }
  if (!options.hasUsers) {
    todo.push("아직 이 앱으로 로그인한 사용자가 없다. 연결을 마치면 사용자에게 실제로 한 번 로그인해 보라고 하고, 콘솔 개요 화면에 로그인 기록이 생기는지 확인하게 하라.");
  }

  const list = (items: string[], empty: string) => (items.length ? items.map((v) => `  - ${v}`).join("\n") : `  - ${empty}`);

  // 콘솔에 "아직 안 끝난 설정"으로 세는 것 (시크릿 안내, 첫 로그인 확인은 할 일이 아니라 안내라 빼고 센다)
  const todoCount = [f.redirectUris.length === 0, webUris.length > 0 && f.postLogoutUris.length === 0, f.providers.length === 0].filter(Boolean).length;

  const prompt = `너는 이 프로젝트에 "Seogaemo로 로그인"을 붙인다. Seogaemo SSO는 OpenID Connect 서버이고, 아래는 콘솔에서 복사한 이 앱의 실제 설정이다. 추측하지 말고 이 값과 규칙을 따른다. 더 자세한 내용은 ${f.issuer}/llms-full.txt 에 있다.

## 이 앱의 설정

- 앱 이름: ${f.name}
- Client ID: ${f.clientId}
- 앱 종류: ${f.publicClient ? "SPA, 모바일 앱 (public client, Client Secret 없음, PKCE만)" : "서버가 있는 웹앱 (confidential client, Client Secret 필요, 환경 변수 SEOGAEMO_CLIENT_SECRET)"}
- Issuer: ${f.issuer}
- Discovery: ${f.issuer}/.well-known/openid-configuration
- ID 토큰 서명: ${f.alg}
- 등록된 Redirect URI:
${list(f.redirectUris, "아직 없음")}
- 등록된 로그아웃 후 이동 주소:
${list(f.postLogoutUris, "아직 없음")}
- 켜진 로그인 방식: ${f.providers.length ? f.providers.map((p) => PROVIDER_META[p].label).join(", ") : "없음"}
- 콘솔 연동 화면: ${f.consoleUrl}

## 먼저 사용자와 처리할 것

코드를 쓰기 전에 아래를 하나씩 확인하고, 사람이 콘솔에서 해야 하는 일은 어디서 무엇을 누르는지 구체적으로 안내하라. 사용자가 했다고 답하기 전에는 그 단계에 기대는 코드를 끝난 것으로 치지 마라.

${todo.map((t, i) => `${i + 1}. ${t}`).join("\n")}

## 할 일

1. 프로젝트의 프레임워크를 확인하고 아래 예시 중 맞는 것을 고른다. 없으면 표준 OIDC 라이브러리를 쓴다 (직접 구현하지 않는다).
2. 로그인, 콜백, 로그아웃, 로그인한 사용자 표시를 붙인다. 사용자 식별은 sub로 한다 (이메일은 바뀔 수 있다).
3. 쓰는 redirect_uri와 post_logout_redirect_uri가 위의 등록값과 글자 하나까지 같은지 확인한다. 다르면 코드를 등록값에 맞추거나, 사용자에게 콘솔에 추가해 달라고 한다.
4. 계정 관리 링크(${f.accountUrl})를 앱의 설정 메뉴에 건다.
5. 끝나면 사용자에게 확인 순서를 알려 준다: 로그인, 새로고침 뒤 로그인 유지, 로그아웃 뒤 앱으로 돌아오기.

${rules(f)}

## 이 앱의 값을 채운 예시 코드

${f.publicClient ? "" : `### Next.js (Auth.js v5)

\`\`\`ts
${ex.authjs}
\`\`\`

### 그 밖의 서버 (openid-client v6)

\`\`\`ts
${ex.server}
\`\`\`

`}### SPA (oidc-client-ts)

\`\`\`ts
${ex.spa}
\`\`\`
${
  f.publicClient
    ? `
### Next.js (Auth.js v5, public client)

\`\`\`ts
${ex.authjs}
\`\`\`

### iOS (AppAuth-iOS)${appUris.length ? "" : " - 앱 스킴 Redirect URI를 먼저 등록해야 한다"}

\`\`\`swift
${ex.ios}
\`\`\`

### Android (AppAuth-Android)${appUris.length ? "" : " - 앱 스킴 Redirect URI를 먼저 등록해야 한다"}

\`\`\`kotlin
${ex.android}
\`\`\`
`
    : ""
}`;
  return { prompt, todoCount };
}
