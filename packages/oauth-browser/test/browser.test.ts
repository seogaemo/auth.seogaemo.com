import { describe, expect, it } from "vitest";

import { createBrowserClient, OAuthError, type BrowserEnv } from "../src/index.js";
import { CLIENT_ID, createFakeServer, ISSUER, metadata, REDIRECT_URI } from "../../oauth/test/fake-server.js";

/** Storage를 흉내 낸 Map */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

/** 이름마다 한 번에 하나씩 실행하는 Web Locks 흉내. 두 "탭"이 같은 인스턴스를 나눠 쓴다 */
function memoryLocks(): LockManager {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request(name: string, callback: (lock: Lock | null) => unknown) {
      const previous = queues.get(name) ?? Promise.resolve();
      const run = previous.then(() => callback(null));
      queues.set(name, run.catch(() => {}));
      return run;
    },
  } as unknown as LockManager;
}

async function setup(shared?: { storage: Storage; locks: LockManager; server: Awaited<ReturnType<typeof createFakeServer>> }) {
  const server = shared?.server ?? (await createFakeServer());
  const storage = shared?.storage ?? new MemoryStorage();
  const navigations: string[] = [];
  let url = "https://app.example.com/";
  const env: Partial<BrowserEnv> = {
    fetch: server.fetch,
    transactionStorage: new MemoryStorage(),
    navigate: (to) => navigations.push(to),
    replaceUrl: (to) => {
      url = to;
    },
    currentUrl: () => url,
    locks: shared?.locks,
    addStorageListener: () => () => {},
  };
  const client = await createBrowserClient({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: "https://app.example.com/",
    issuer: ISSUER,
    storage,
    env,
  });
  return { server, storage, client, navigations, setUrl: (to: string) => (url = to), getUrl: () => url };
}

/** login()이 보낸 authorize 주소로 서버가 돌려보낸 콜백 주소 */
async function loginAndReturn(t: Awaited<ReturnType<typeof setup>>, returnTo?: string) {
  await t.client.login({ returnTo });
  const callback = t.server.authorize(new URL(t.navigations.at(-1)!));
  t.setUrl(callback.toString());
  return t.client.handleCallback();
}

describe("oauth-browser", () => {
  it("logs in, keeps the user, and cleans the callback URL", async () => {
    const t = await setup();
    const changes: unknown[] = [];
    t.client.onChange((user) => changes.push(user?.sub ?? null));

    const result = await loginAndReturn(t, "/dashboard");
    expect(result.claims.sub).toBe("user-1");
    expect(result.returnTo).toBe("/dashboard");
    expect(t.client.getUser()?.email).toBe("a@example.com");
    expect(await t.client.getAccessToken()).toBe("at-1");
    expect(new URL(t.getUrl()).search).toBe("");
    expect(changes).toEqual(["user-1"]);
  });

  it("only returns to paths in this app", async () => {
    const t = await setup();
    expect((await loginAndReturn(t, "https://evil.example.com")).returnTo).toBeUndefined();
    expect((await loginAndReturn(t, "//evil.example.com")).returnTo).toBeUndefined();
  });

  it("a callback without a login started in this tab is refused", async () => {
    const t = await setup();
    t.setUrl(`${REDIRECT_URI}?code=x&state=forged&iss=${encodeURIComponent(ISSUER)}`);
    await expect(t.client.handleCallback()).rejects.toBeInstanceOf(OAuthError);
    expect(t.client.getUser()).toBeNull();
  });

  it("a callback cannot be replayed (reload, back button)", async () => {
    const t = await setup();
    await t.client.login();
    const callback = t.server.authorize(new URL(t.navigations.at(-1)!)).toString();
    await t.client.handleCallback(callback);
    await expect(t.client.handleCallback(callback)).rejects.toThrow(/no login in progress/);
  });

  it("refreshes an expiring access token and stores the rotated refresh token", async () => {
    const t = await setup();
    await loginAndReturn(t);
    const key = `seogaemo.session.${CLIENT_ID}`;
    const stored = JSON.parse(t.storage.getItem(key)!);
    t.storage.setItem(key, JSON.stringify({ ...stored, expiresAt: Date.now() + 10_000 }));

    expect(await t.client.getAccessToken()).toBe("at-2");
    expect(JSON.parse(t.storage.getItem(key)!).refreshToken).toBe("rt-2");
  });

  it("two tabs refreshing at once send one refresh request (rotation would otherwise log both out)", async () => {
    const shared = { storage: new MemoryStorage(), locks: memoryLocks(), server: await createFakeServer() };
    const tabA = await setup(shared);
    const tabB = await setup(shared);
    await loginAndReturn(tabA);
    const key = `seogaemo.session.${CLIENT_ID}`;
    shared.storage.setItem(key, JSON.stringify({ ...JSON.parse(shared.storage.getItem(key)!), expiresAt: 0 }));

    const before = shared.server.requests.filter((r) => r.body.get("grant_type") === "refresh_token").length;
    const [a, b] = await Promise.all([tabA.client.getAccessToken(), tabB.client.getAccessToken()]);
    const refreshes = shared.server.requests.filter((r) => r.body.get("grant_type") === "refresh_token").length - before;
    expect(refreshes).toBe(1);
    expect([a, b]).toEqual(["at-2", "at-2"]);
  });

  it("a dead refresh token ends the session instead of throwing", async () => {
    const t = await setup();
    await loginAndReturn(t);
    const key = `seogaemo.session.${CLIENT_ID}`;
    t.storage.setItem(key, JSON.stringify({ ...JSON.parse(t.storage.getItem(key)!), expiresAt: 0, refreshToken: "revoked" }));
    expect(await t.client.getAccessToken()).toBeNull();
    expect(t.client.getUser()).toBeNull();
  });

  it("logout revokes the refresh token and goes to the end session endpoint with a hint", async () => {
    const t = await setup();
    await loginAndReturn(t);
    await t.client.logout();
    const revoke = t.server.requests.find((r) => r.url === metadata.revocation_endpoint)!;
    expect(revoke.body.get("token")).toBe("rt-1");
    const end = new URL(t.navigations.at(-1)!);
    expect(end.origin + end.pathname).toBe(metadata.end_session_endpoint);
    expect(end.searchParams.get("id_token_hint")).toBeTruthy();
    expect(end.searchParams.get("post_logout_redirect_uri")).toBe("https://app.example.com/");
    expect(t.client.getUser()).toBeNull();
  });
});
