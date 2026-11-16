import { getCloudflareContext } from "@opennextjs/cloudflare";

import { endpoint, type Provider, type SocialProvider } from "../config";
import { isMailConfigured } from "../mail";
import { pkceChallenge } from "../crypto";

export interface ProviderProfile {
  id: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  image?: string;
}

interface ProviderCredentials {
  clientId: string;
  clientSecret?: string;
  /**
   * 고정 secret 말고 다른 값이 필요한 제공자용 (예: Apple은 팀 ID, 키 ID, 개인 키로
   * exchangeCode 안에서 client secret JWT를 그때그때 서명한다)
   */
  extra?: Record<string, string>;
}

/** 토큰 교환 결과. OIDC 제공자는 id_token에 사용자 정보가 들어 있다 (Apple은 여기에만 있다) */
export interface ProviderTokens {
  accessToken: string;
  idToken?: string;
}

/**
 * 외부 OAuth 제공자 하나. 이름, 로고, 버튼 모양은 lib/provider-meta.ts에 둔다.
 * 콜백은 GET과 POST(response_mode=form_post) 둘 다 받는다.
 */
interface ProviderDefinition {
  /** 외부 제공자가 PKCE를 지원하면 true */
  pkce: boolean;
  /** 서버에 키가 없으면 null (그 수단은 화면과 콘솔에서 꺼진다) */
  credentials(env: CloudflareEnv): ProviderCredentials | null;
  authorizeUrl(params: {
    credentials: ProviderCredentials;
    redirectUri: string;
    state: string;
    codeChallenge?: string;
  }): URL;
  exchangeCode(params: {
    credentials: ProviderCredentials;
    redirectUri: string;
    code: string;
    codeVerifier?: string;
  }): Promise<ProviderTokens>;
  fetchProfile(tokens: ProviderTokens, credentials: ProviderCredentials): Promise<ProviderProfile>;
}

async function postForm(url: string, body: Record<string, string | undefined>) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value) form.set(key, value);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok || typeof json.access_token !== "string") {
    throw new ProviderError(`token exchange failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return {
    accessToken: json.access_token,
    idToken: typeof json.id_token === "string" ? json.id_token : undefined,
  } satisfies ProviderTokens;
}

async function getJson<T>(url: string, accessToken: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new ProviderError(`profile request failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export class ProviderError extends Error {}

const google: ProviderDefinition = {
  pkce: true,
  credentials(env) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
    return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  },
  authorizeUrl({ credentials, redirectUri, state, codeChallenge }) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");
    if (codeChallenge) {
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
    }
    return url;
  },
  exchangeCode({ credentials, redirectUri, code, codeVerifier }) {
    return postForm("https://oauth2.googleapis.com/token", {
      grant_type: "authorization_code",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    });
  },
  async fetchProfile({ accessToken }) {
    const profile = await getJson<{
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    }>("https://openidconnect.googleapis.com/v1/userinfo", accessToken);

    return {
      id: profile.sub,
      email: profile.email,
      emailVerified: profile.email_verified === true,
      name: profile.name,
      image: profile.picture,
    };
  },
};

const kakao: ProviderDefinition = {
  pkce: false,
  credentials(env) {
    if (!env.KAKAO_CLIENT_ID) return null;
    return { clientId: env.KAKAO_CLIENT_ID, clientSecret: env.KAKAO_CLIENT_SECRET || undefined };
  },
  // scope를 지정하지 않으면 카카오 콘솔의 동의항목 설정을 따른다.
  authorizeUrl({ credentials, redirectUri, state }) {
    const url = new URL("https://kauth.kakao.com/oauth/authorize");
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return url;
  },
  exchangeCode({ credentials, redirectUri, code }) {
    return postForm("https://kauth.kakao.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: redirectUri,
      code,
    });
  },
  async fetchProfile({ accessToken }) {
    const profile = await getJson<{
      id: number;
      kakao_account?: {
        email?: string;
        is_email_valid?: boolean;
        is_email_verified?: boolean;
        profile?: { nickname?: string; profile_image_url?: string };
      };
    }>("https://kapi.kakao.com/v2/user/me", accessToken);
    const account = profile.kakao_account;

    return {
      id: String(profile.id),
      email: account?.email,
      emailVerified: account?.is_email_valid === true && account?.is_email_verified === true,
      name: account?.profile?.nickname,
      image: account?.profile?.profile_image_url,
    };
  },
};

/** provider-meta.ts의 소셜 수단마다 구현이 있어야 한다 (빠지면 타입 오류) */
const definitions: Record<SocialProvider, ProviderDefinition> = { google, kakao };

export function providerCallbackUrl(provider: SocialProvider) {
  return endpoint(`/oauth/provider/${provider}/callback`);
}

function credentialsOf(provider: SocialProvider) {
  return definitions[provider].credentials(getCloudflareContext().env);
}

/** 서버에 키가 설정된 로그인 수단인지. 이메일 계열은 메일 발송이 설정돼 있어야 한다. */
export function isProviderConfigured(provider: Provider) {
  if (provider === "password" || provider === "email") return isMailConfigured();
  return credentialsOf(provider) !== null;
}

export async function buildProviderAuthorizeUrl(
  provider: SocialProvider,
  state: string,
  codeVerifier: string | null,
) {
  const def = definitions[provider];
  const credentials = credentialsOf(provider);
  if (!credentials) throw new ProviderError(`${provider} is not configured`);

  return def.authorizeUrl({
    credentials,
    redirectUri: providerCallbackUrl(provider),
    state,
    codeChallenge: codeVerifier ? await pkceChallenge(codeVerifier) : undefined,
  });
}

export function providerUsesPkce(provider: SocialProvider) {
  return definitions[provider].pkce;
}

export async function completeProviderLogin(
  provider: SocialProvider,
  code: string,
  codeVerifier: string | null,
) {
  const def = definitions[provider];
  const credentials = credentialsOf(provider);
  if (!credentials) throw new ProviderError(`${provider} is not configured`);

  const tokens = await def.exchangeCode({
    credentials,
    redirectUri: providerCallbackUrl(provider),
    code,
    codeVerifier: codeVerifier ?? undefined,
  });
  return def.fetchProfile(tokens, credentials);
}
