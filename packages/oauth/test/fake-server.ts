/**
 * 테스트용 가짜 인가 서버. 실제 서버(apps/auth)처럼 ES256으로 ID 토큰을 서명하고,
 * 받은 요청을 기록해서 클라이언트가 표준대로 보냈는지 확인할 수 있게 한다.
 */
import { createHash } from "node:crypto";

import { base64UrlEncode } from "../src/encoding.js";
import type { ServerMetadata } from "../src/metadata.js";

export const ISSUER = "https://auth.example.com";
export const CLIENT_ID = "client-123";
export const REDIRECT_URI = "https://app.example.com/callback";

export const metadata: ServerMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/authorize`,
  token_endpoint: `${ISSUER}/oauth/token`,
  userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
  revocation_endpoint: `${ISSUER}/oauth/revoke`,
  end_session_endpoint: `${ISSUER}/oauth/logout`,
  jwks_uri: `${ISSUER}/.well-known/jwks.json`,
  id_token_signing_alg_values_supported: ["ES256"],
  code_challenge_methods_supported: ["S256"],
  authorization_response_iss_parameter_supported: true,
};

export interface Recorded {
  url: string;
  method: string;
  headers: Headers;
  body: URLSearchParams;
}

export async function createFakeServer() {
  const keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicJwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: "key-1", alg: "ES256", use: "sig" };

  const requests: Recorded[] = [];
  /** 코드 하나 = authorize에서 받은 challenge와 nonce */
  const codes = new Map<string, { challenge: string; nonce?: string; redirectUri: string }>();
  let jwksFetches = 0;
  let nextTokenClaims: Record<string, unknown> = {};

  async function sign(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "ES256", kid: "key-1", typ: "JWT" }) {
    const enc = (value: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
    const input = `${enc(header)}.${enc(claims)}`;
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, new TextEncoder().encode(input)),
    );
    return `${input}.${base64UrlEncode(signature)}`;
  }

  function idTokenClaims(extra: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    return { iss: ISSUER, sub: "user-1", aud: CLIENT_ID, exp: now + 600, iat: now, auth_time: now, email: "a@example.com", ...extra };
  }

  /** authorize 단계를 흉내 내고 콜백 주소를 돌려준다 */
  function authorize(authorizeUrl: URL, override: Record<string, string | null> = {}) {
    const code = crypto.randomUUID();
    codes.set(code, {
      challenge: authorizeUrl.searchParams.get("code_challenge")!,
      nonce: authorizeUrl.searchParams.get("nonce") ?? undefined,
      redirectUri: authorizeUrl.searchParams.get("redirect_uri")!,
    });
    const callback = new URL(authorizeUrl.searchParams.get("redirect_uri")!);
    const params: Record<string, string | null> = { code, state: authorizeUrl.searchParams.get("state"), iss: ISSUER, ...override };
    for (const [key, value] of Object.entries(params)) if (value !== null) callback.searchParams.set(key, value);
    return callback;
  }

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = new URLSearchParams(typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : "");
    const headers = new Headers(init?.headers);
    requests.push({ url, method: init?.method ?? "GET", headers, body });

    if (url === `${ISSUER}/.well-known/openid-configuration`) return json(metadata);
    if (url === metadata.jwks_uri) {
      jwksFetches++;
      return json({ keys: [publicJwk] });
    }
    if (url === metadata.token_endpoint) {
      const grant = body.get("grant_type");
      if (grant === "authorization_code") {
        const entry = codes.get(body.get("code") ?? "");
        codes.delete(body.get("code") ?? "");
        if (!entry) return json({ error: "invalid_grant", error_description: "code is invalid" }, 400);
        const challenge = createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url");
        if (challenge !== entry.challenge) return json({ error: "invalid_grant", error_description: "PKCE failed" }, 400);
        if (body.get("redirect_uri") !== entry.redirectUri) return json({ error: "invalid_grant", error_description: "redirect_uri" }, 400);
        const id_token = await sign(idTokenClaims({ nonce: entry.nonce, ...nextTokenClaims }));
        return json({ access_token: "at-1", token_type: "Bearer", expires_in: 3600, refresh_token: "rt-1", id_token, scope: "openid email profile" });
      }
      if (grant === "refresh_token") {
        if (body.get("refresh_token") !== "rt-1") return json({ error: "invalid_grant", error_description: "refresh token is invalid" }, 400);
        return json({ access_token: "at-2", token_type: "Bearer", expires_in: 3600, refresh_token: "rt-2", id_token: await sign(idTokenClaims()) });
      }
      return json({ error: "unsupported_grant_type" }, 400);
    }
    if (url === metadata.revocation_endpoint) return new Response(null, { status: 200 });
    if (url === metadata.userinfo_endpoint) {
      if (headers.get("authorization") !== "Bearer at-1") {
        return new Response(null, { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token", error_description="expired"' } });
      }
      return json({ sub: "user-1", email: "a@example.com" });
    }
    return new Response("not found", { status: 404 });
  };

  return {
    fetch: fetchImpl,
    requests,
    authorize,
    sign,
    idTokenClaims,
    publicJwk,
    get jwksFetches() {
      return jwksFetches;
    },
    /** 다음 코드 교환의 ID 토큰 클레임을 바꾼다 (검증 실패 테스트용) */
    setNextTokenClaims(claims: Record<string, unknown>) {
      nextTokenClaims = claims;
    },
  };
}
