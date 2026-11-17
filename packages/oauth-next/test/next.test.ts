import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_ID, createFakeServer, ISSUER, metadata } from "../../oauth/test/fake-server.js";

/** next/headers의 cookies()를 흉내 낸다. writable=false면 서버 컴포넌트처럼 set이 예외를 던진다 */
const jar = { values: new Map<string, string>(), writable: true };
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name)! } : undefined),
    set: (name: string, value: string) => {
      if (!jar.writable) throw new Error("Cookies can only be modified in a Server Action or Route Handler");
      jar.values.set(name, value);
    },
  }),
}));

const { createSeogaemoAuth, RefreshNotPossibleHere } = await import("../src/index.js");

const BASE = "https://app.example.com";
const SECRET = "x".repeat(40);

async function setup() {
  const server = await createFakeServer();
  // 가짜 서버의 Redirect URI가 app.example.com/callback 이라 콜백 경로를 맞춘다
  const auth = createSeogaemoAuth({ clientId: CLIENT_ID, baseUrl: BASE, secret: SECRET, issuer: ISSUER, fetch: server.fetch, basePath: "" });
  return { server, auth };
}

/** Set-Cookie 헤더들을 이름 -> 값으로 */
function setCookies(response: Response) {
  const out = new Map<string, { value: string; attrs: string }>();
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split("; ");
    const index = pair!.indexOf("=");
    out.set(pair!.slice(0, index), { value: decodeURIComponent(pair!.slice(index + 1)), attrs: attrs.join("; ") });
  }
  return out;
}

async function logIn(t: Awaited<ReturnType<typeof setup>>, returnTo = "/dashboard") {
  const start = await t.auth.handlers.GET(new Request(`${BASE}/login?returnTo=${encodeURIComponent(returnTo)}`));
  const tx = setCookies(start).get("seogaemo_session_tx")!;
  const callback = t.server.authorize(new URL(start.headers.get("location")!));
  const done = await t.auth.handlers.GET(new Request(callback, { headers: { cookie: `seogaemo_session_tx=${encodeURIComponent(tx.value)}` } }));
  return { start, tx, done, session: setCookies(done).get("seogaemo_session") };
}

beforeEach(() => {
  jar.values.clear();
  jar.writable = true;
});

describe("route handlers", () => {
  it("login -> Seogaemo -> callback sets an encrypted session and returns to returnTo", async () => {
    const t = await setup();
    const { start, tx, done, session } = await logIn(t);
    expect(new URL(start.headers.get("location")!).searchParams.get("code_challenge_method")).toBe("S256");
    expect(tx.attrs).toMatch(/HttpOnly/);
    expect(tx.attrs).toMatch(/Secure/);
    expect(done.headers.get("location")).toBe(`${BASE}/dashboard`);
    expect(session!.value).not.toContain("at-1"); // 암호화돼 있다
    expect(setCookies(done).get("seogaemo_session_tx")!.attrs).toMatch(/Max-Age=0/);

    jar.values.set("seogaemo_session", session!.value);
    expect((await t.auth.getUser())?.sub).toBe("user-1");
    expect(await t.auth.getAccessToken()).toBe("at-1");
    expect(await t.auth.getSession()).not.toHaveProperty("refreshToken");
  });

  it("returnTo outside the app falls back to /", async () => {
    const t = await setup();
    expect((await logIn(t, "https://evil.example.com")).done.headers.get("location")).toBe(`${BASE}/`);
    expect((await logIn(t, "//evil.example.com")).done.headers.get("location")).toBe(`${BASE}/`);
  });

  it("a callback without the login cookie is refused", async () => {
    const t = await setup();
    const start = await t.auth.handlers.GET(new Request(`${BASE}/login`));
    const callback = t.server.authorize(new URL(start.headers.get("location")!));
    const done = await t.auth.handlers.GET(new Request(callback));
    expect(done.headers.get("location")).toBe(`${BASE}/?auth_error=invalid_request`);
    expect(setCookies(done).has("seogaemo_session")).toBe(false);
  });

  it("a tampered session cookie is ignored", async () => {
    const t = await setup();
    const { session } = await logIn(t);
    const [iv, cipher] = session!.value.split(".");
    jar.values.set("seogaemo_session", `${iv}.${cipher!.slice(0, -2)}AA`);
    expect(await t.auth.getUser()).toBeNull();
  });

  it("logout: POST only, same origin only, revokes and goes to end session with a hint", async () => {
    const t = await setup();
    const { session } = await logIn(t);
    const cookie = `seogaemo_session=${encodeURIComponent(session!.value)}`;

    expect((await t.auth.handlers.GET(new Request(`${BASE}/logout`, { headers: { cookie } }))).status).toBe(405);
    const crossSite = await t.auth.handlers.POST(new Request(`${BASE}/logout`, { method: "POST", headers: { cookie, origin: "https://evil.example.com" } }));
    expect(crossSite.status).toBe(403);

    const out = await t.auth.handlers.POST(new Request(`${BASE}/logout`, { method: "POST", headers: { cookie, origin: BASE } }));
    expect(out.status).toBe(303);
    const end = new URL(out.headers.get("location")!);
    expect(end.origin + end.pathname).toBe(metadata.end_session_endpoint);
    expect(end.searchParams.get("id_token_hint")).toBeTruthy();
    expect(end.searchParams.get("post_logout_redirect_uri")).toBe(`${BASE}/`);
    expect(setCookies(out).get("seogaemo_session")!.attrs).toMatch(/Max-Age=0/);
    expect(t.server.requests.some((r) => r.url === metadata.revocation_endpoint && r.body.get("token") === "rt-1")).toBe(true);
  });
});

describe("token refresh", () => {
  async function expiredSession() {
    const t = await setup();
    const { session } = await logIn(t);
    jar.values.set("seogaemo_session", session!.value);
    // 만료된 세션을 만든다: 서버 쪽 expires_in을 0으로 볼 수 없으니 시계를 앞으로 돌린다
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    return t;
  }

  it("refreshes where cookies are writable and stores the rotated token", async () => {
    const t = await expiredSession();
    try {
      expect(await t.auth.getAccessToken()).toBe("at-2");
      jar.writable = true;
      expect(await t.auth.getAccessToken()).toBe("at-2"); // 저장된 새 세션을 그대로 쓴다
    } finally {
      vi.useRealTimers();
    }
  });

  it("in a Server Component it refuses BEFORE rotating, so the stored refresh token stays valid", async () => {
    const t = await expiredSession();
    try {
      jar.writable = false;
      const before = t.server.requests.length;
      await expect(t.auth.getAccessToken()).rejects.toBeInstanceOf(RefreshNotPossibleHere);
      expect(t.server.requests.length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("middleware refreshes before rendering, but not for prefetches", async () => {
    const t = await expiredSession();
    try {
      const cookie = `seogaemo_session=${encodeURIComponent(jar.values.get("seogaemo_session")!)}`;
      const prefetch = await t.auth.middleware(new NextRequest(`${BASE}/page`, { headers: { cookie, "next-router-prefetch": "1" } }));
      expect(prefetch.headers.getSetCookie()).toEqual([]);
      const page = await t.auth.middleware(new NextRequest(`${BASE}/page`, { headers: { cookie } }));
      expect(page.headers.getSetCookie().some((c) => c.startsWith("seogaemo_session="))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
