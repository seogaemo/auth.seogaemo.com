import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildAuthorizationUrl,
  buildLogoutUrl,
  createClient,
  createPkce,
  discover,
  exchangeCode,
  OAuthError,
  parseCallback,
  pkceChallenge,
  RemoteJwks,
  ValidationError,
  verifyIdToken,
} from "../src/index.js";
import { CLIENT_ID, createFakeServer, ISSUER, metadata, REDIRECT_URI } from "./fake-server.js";

describe("discovery (OIDC Discovery 4.3)", () => {
  it("reads metadata", async () => {
    const server = await createFakeServer();
    expect((await discover(ISSUER, { fetch: server.fetch })).token_endpoint).toBe(metadata.token_endpoint);
  });

  it("rejects a document whose issuer differs from the one asked for", async () => {
    const server = await createFakeServer();
    await expect(discover("https://auth.example.com/other", { fetch: server.fetch })).rejects.toThrow(ValidationError);
    const lying: typeof fetch = async () => Response.json({ ...metadata, issuer: "https://evil.example.com" });
    await expect(discover(ISSUER, { fetch: lying })).rejects.toMatchObject({ code: "issuer_mismatch" });
  });
});

describe("PKCE (RFC 7636)", () => {
  it("challenge is BASE64URL(SHA256(verifier))", async () => {
    const pkce = await createPkce();
    expect(pkce.method).toBe("S256");
    expect(pkce.verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(pkce.challenge).toBe(createHash("sha256").update(pkce.verifier).digest("base64url"));
  });

  it("rejects verifiers outside 43-128 unreserved characters", async () => {
    await expect(pkceChallenge("short")).rejects.toThrow(TypeError);
    await expect(pkceChallenge("a".repeat(42) + "+")).rejects.toThrow(TypeError);
  });

  it("verifiers are random", async () => {
    const [a, b] = await Promise.all([createPkce(), createPkce()]);
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe("authorization request (RFC 6749 4.1.1)", () => {
  it("sends code flow with S256 and keeps the endpoint's own query", () => {
    const url = buildAuthorizationUrl(
      { authorization_endpoint: `${ISSUER}/oauth/authorize?tenant=x` },
      { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, state: "s", codeChallenge: "c", nonce: "n", prompt: "login", maxAge: 0 },
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tenant: "x",
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "openid email profile",
      state: "s",
      code_challenge: "c",
      code_challenge_method: "S256",
      nonce: "n",
      prompt: "login",
      max_age: "0",
    });
  });
});

describe("callback (RFC 6749 4.1.2, RFC 9207)", () => {
  const ok = (params: Record<string, string>) => `${REDIRECT_URI}?${new URLSearchParams(params)}`;

  it("returns the code", () => {
    expect(parseCallback(ok({ code: "c", state: "s", iss: ISSUER }), { state: "s", metadata })).toEqual({ code: "c" });
  });

  it("rejects a different state", () => {
    expect(() => parseCallback(ok({ code: "c", state: "x", iss: ISSUER }), { state: "s", metadata })).toThrow(
      expect.objectContaining({ code: "state_mismatch" }),
    );
  });

  it("requires iss when the server advertises it, and rejects a wrong one (mix-up)", () => {
    expect(() => parseCallback(ok({ code: "c", state: "s" }), { state: "s", metadata })).toThrow(expect.objectContaining({ code: "issuer_mismatch" }));
    expect(() => parseCallback(ok({ code: "c", state: "s", iss: "https://evil.example.com" }), { state: "s", metadata })).toThrow(
      expect.objectContaining({ code: "issuer_mismatch" }),
    );
  });

  it("checks iss even when the server does not advertise support, if it is present", () => {
    const quiet = { issuer: ISSUER };
    expect(parseCallback(ok({ code: "c", state: "s" }), { state: "s", metadata: quiet })).toEqual({ code: "c" });
    expect(() => parseCallback(ok({ code: "c", state: "s", iss: "https://evil.example.com" }), { state: "s", metadata: quiet })).toThrow(
      ValidationError,
    );
  });

  it("turns error responses into OAuthError, after checking state", () => {
    expect(() => parseCallback(ok({ error: "login_required", state: "s", iss: ISSUER }), { state: "s", metadata })).toThrow(
      expect.objectContaining({ name: "OAuthError", error: "login_required" }),
    );
    expect(() => parseCallback(ok({ error: "access_denied", state: "forged", iss: ISSUER }), { state: "s", metadata })).toThrow(
      expect.objectContaining({ code: "state_mismatch" }),
    );
  });
});

describe("token endpoint client authentication (RFC 6749 2.3)", () => {
  async function exchangeWith(client: Parameters<typeof exchangeCode>[1]) {
    const server = await createFakeServer();
    await exchangeCode(metadata, client, { code: "x", redirectUri: REDIRECT_URI, codeVerifier: "v".repeat(43) }, { fetch: server.fetch }).catch(
      () => {},
    );
    return server.requests[0]!;
  }

  it("public client sends client_id only", async () => {
    const req = await exchangeWith({ clientId: CLIENT_ID });
    expect(req.headers.get("authorization")).toBeNull();
    expect(req.body.get("client_id")).toBe(CLIENT_ID);
    expect(req.body.get("client_secret")).toBeNull();
    expect(req.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
  });

  it("client_secret_basic form-encodes id and secret before base64", async () => {
    const req = await exchangeWith({ clientId: "id with space", clientSecret: "s:e/c+r%t" });
    const decoded = atob(req.headers.get("authorization")!.replace("Basic ", ""));
    expect(decoded).toBe("id+with+space:s%3Ae%2Fc%2Br%25t");
    expect(req.body.get("client_secret")).toBeNull();
  });

  it("client_secret_post puts both in the body", async () => {
    const req = await exchangeWith({ clientId: CLIENT_ID, clientSecret: "sec", authMethod: "client_secret_post" });
    expect(req.body.get("client_id")).toBe(CLIENT_ID);
    expect(req.body.get("client_secret")).toBe("sec");
  });

  it("error responses become OAuthError with status", async () => {
    const server = await createFakeServer();
    await expect(
      exchangeCode(metadata, { clientId: CLIENT_ID }, { code: "nope", redirectUri: REDIRECT_URI, codeVerifier: "v".repeat(43) }, { fetch: server.fetch }),
    ).rejects.toMatchObject({ error: "invalid_grant", status: 400 });
  });
});

describe("ID token (OIDC Core 3.1.3.7)", () => {
  async function setup() {
    const server = await createFakeServer();
    const jwks = new RemoteJwks(metadata.jwks_uri, { fetch: server.fetch });
    const verify = (token: string, check: Partial<Parameters<typeof verifyIdToken>[3]> = {}) =>
      verifyIdToken(token, metadata, jwks, { clientId: CLIENT_ID, ...check });
    return { server, jwks, verify };
  }

  it("accepts a valid token", async () => {
    const { server, verify } = await setup();
    const claims = await verify(await server.sign(server.idTokenClaims({ nonce: "n" })), { nonce: "n" });
    expect(claims.sub).toBe("user-1");
  });

  it.each([
    ["wrong iss", { iss: "https://evil.example.com" }],
    ["wrong aud", { aud: "someone-else" }],
    ["several aud without azp", { aud: [CLIENT_ID, "other"] }],
    ["azp for another client", { azp: "other" }],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 120 }],
    ["iat in the future", { iat: Math.floor(Date.now() / 1000) + 600 }],
    ["missing sub", { sub: "" }],
  ])("rejects %s", async (_name, claims) => {
    const { server, verify } = await setup();
    await expect(verify(await server.sign(server.idTokenClaims(claims)))).rejects.toMatchObject({ code: "invalid_id_token" });
  });

  it("checks nonce and max_age", async () => {
    const { server, verify } = await setup();
    const token = await server.sign(server.idTokenClaims({ nonce: "n", auth_time: Math.floor(Date.now() / 1000) - 3600 }));
    await expect(verify(token, { nonce: "other" })).rejects.toThrow(/nonce/);
    await expect(verify(token, { nonce: "n", maxAge: 60 })).rejects.toThrow(/max_age/);
    await expect(verify(token, { nonce: "n", maxAge: 7200 })).resolves.toBeTruthy();
  });

  it("rejects alg none and algorithms the server does not use", async () => {
    const { server, verify } = await setup();
    const claims = server.idTokenClaims();
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    await expect(verify(`${enc({ alg: "none" })}.${enc(claims)}.`)).rejects.toThrow(/alg/);
    await expect(verify(await server.sign(claims, { alg: "HS256", kid: "key-1" }))).rejects.toThrow(/alg/);
  });

  it("rejects a tampered payload", async () => {
    const { server, verify } = await setup();
    const [h, , s] = (await server.sign(server.idTokenClaims())).split(".");
    const forged = Buffer.from(JSON.stringify(server.idTokenClaims({ sub: "admin" }))).toString("base64url");
    await expect(verify(`${h}.${forged}.${s}`)).rejects.toThrow(/signature/);
  });

  it("refetches JWKS once for an unknown kid, then gives up", async () => {
    const { server, jwks, verify } = await setup();
    await verify(await server.sign(server.idTokenClaims()));
    expect(server.jwksFetches).toBe(1);
    (jwks as unknown as { fetchedAt: number }).fetchedAt = 0;
    await expect(verify(await server.sign(server.idTokenClaims(), { alg: "ES256", kid: "rotated" }))).rejects.toThrow(/kid/);
    expect(server.jwksFetches).toBe(2);
  });
});

describe("createClient: whole flow", () => {
  async function setup() {
    const server = await createFakeServer();
    const client = await createClient({ issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, fetch: server.fetch });
    return { server, client };
  }

  it("logs in, refreshes, reads userinfo, revokes and builds a logout URL", async () => {
    const { server, client } = await setup();
    const { url, transaction } = await client.startLogin({ prompt: "select_account" });
    expect(url.searchParams.get("nonce")).toBe(transaction.nonce);
    // 트랜잭션은 JSON으로 저장했다가 돌아와서 다시 읽는다
    const stored = JSON.parse(JSON.stringify(transaction));

    const result = await client.finishLogin(server.authorize(url), stored);
    expect(result.tokens.refresh_token).toBe("rt-1");
    expect(result.claims?.sub).toBe("user-1");

    expect(await client.userInfo(result.tokens.access_token, result.claims?.sub)).toMatchObject({ sub: "user-1" });
    await expect(client.userInfo("at-1", "someone-else")).rejects.toThrow(ValidationError);
    await expect(client.userInfo("bad")).rejects.toMatchObject({ error: "invalid_token", description: "expired", status: 401 });

    const refreshed = await client.refresh("rt-1");
    expect(refreshed.tokens.refresh_token).toBe("rt-2");
    await expect(client.refresh("rt-1-old")).rejects.toBeInstanceOf(OAuthError);

    await client.revoke("rt-2", "refresh_token");
    const revoke = server.requests.at(-1)!;
    expect(revoke.body.get("token")).toBe("rt-2");
    expect(revoke.body.get("token_type_hint")).toBe("refresh_token");

    const logout = client.logoutUrl({ idTokenHint: result.tokens.id_token, postLogoutRedirectUri: "https://app.example.com/" });
    expect(logout.origin + logout.pathname).toBe(metadata.end_session_endpoint);
    expect(logout.searchParams.get("client_id")).toBe(CLIENT_ID);
  });

  it("rejects an ID token whose nonce came from another login", async () => {
    const { server, client } = await setup();
    const { url, transaction } = await client.startLogin();
    server.setNextTokenClaims({ nonce: "from-elsewhere" });
    await expect(client.finishLogin(server.authorize(url), transaction)).rejects.toThrow(/nonce/);
  });

  it("a callback for another transaction fails on state before any token request", async () => {
    const { server, client } = await setup();
    const first = await client.startLogin();
    const second = await client.startLogin();
    const before = server.requests.length;
    await expect(client.finishLogin(server.authorize(first.url), second.transaction)).rejects.toMatchObject({ code: "state_mismatch" });
    expect(server.requests.length).toBe(before);
  });

  it("logout URL needs the endpoint", () => {
    expect(() => buildLogoutUrl({})).toThrow(TypeError);
  });
});
