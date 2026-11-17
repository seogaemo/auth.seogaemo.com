import type { Session, User } from "@prisma/client";
import { cookies } from "next/headers";

import { getPrisma } from "@/cloudflare";
import { isEmailAllowed } from "../allowlist";
import { BROWSER_COOKIE, TTL } from "../config";
import { hashSecret, randomToken } from "../crypto";
import { clientInfo } from "../request";

/**
 * 로그인 유지 (SSO 세션).
 *
 * 브라우저마다 랜덤 쿠키(sg_browser) 하나를 두고, 서비스마다 Session 행을 (쿠키 해시, 서비스)로 찾는다.
 * 서비스마다 사용자가 따로라서 세션도 서비스마다 따로다. 쿠키에는 사용자 정보가 없다.
 */

export type ActiveSession = Session & { user: User };

/** 응답에 실을 브라우저 쿠키 설정. 이미 있으면 그대로 쓴다. */
export function browserCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: TTL.browserCookieSec,
  };
}

export function newBrowserKey() {
  return randomToken();
}

export async function currentBrowserKey() {
  return (await cookies()).get(BROWSER_COOKIE)?.value ?? null;
}

/** 살아 있는 세션. 만료됐거나 사용자가 정지됐으면 null */
export async function findSession(browserKey: string | null | undefined, serviceId: string): Promise<ActiveSession | null> {
  if (!browserKey) return null;
  const session = await getPrisma().session.findUnique({
    where: { browserHash_serviceId: { browserHash: await hashSecret(browserKey), serviceId } },
    include: { user: true, service: { select: { restrictLogin: true, allowedEmails: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) return null;
  // 접근 제한이 켜지거나 바뀌어 목록 밖이 된 사용자는 세션으로도 들어올 수 없다
  if (!isEmailAllowed(session.service, session.user.email)) return null;
  return session;
}

/** max_age(초)가 지났으면 다시 인증해야 한다 */
export function isAuthTooOld(session: Pick<Session, "authTime">, maxAge: number | null | undefined) {
  if (maxAge === null || maxAge === undefined) return false;
  return Date.now() - session.authTime.getTime() > maxAge * 1000;
}

/** 직접 인증이 끝났을 때 세션을 만들거나 새로 시작한다 (다른 사용자로 바뀌어도 덮어쓴다) */
export async function startSession(params: { browserKey: string; serviceId: string; userId: string; method: string }) {
  const { browserKey, serviceId, userId, method } = params;
  const { ip, userAgent } = await clientInfo();
  const now = new Date();
  const data = {
    userId,
    method,
    authTime: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + TTL.sessionMs),
    ip,
    userAgent,
  };
  const browserHash = await hashSecret(browserKey);
  const prisma = getPrisma();

  const existing = await prisma.session.findUnique({
    where: { browserHash_serviceId: { browserHash, serviceId } },
  });
  if (existing && existing.userId !== userId) {
    // 다른 사용자로 바뀌면 앞 사용자의 이 세션 토큰은 끊는다
    await revokeSessionTokens(existing.id);
  }

  return prisma.session.upsert({
    where: { browserHash_serviceId: { browserHash, serviceId } },
    create: { browserHash, serviceId, ...data },
    update: data,
  });
}

export async function touchSession(sessionId: string) {
  await getPrisma().session.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } });
}

async function revokeSessionTokens(sessionId: string) {
  await getPrisma().refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 이 브라우저에서 이 서비스 로그아웃. 세션에서 나온 refresh token도 끊는다. */
export async function endSession(browserKey: string | null | undefined, serviceId: string) {
  if (!browserKey) return null;
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { browserHash_serviceId: { browserHash: await hashSecret(browserKey), serviceId } },
  });
  if (!session) return null;
  await revokeSessionTokens(session.id);
  await prisma.session.delete({ where: { id: session.id } });
  return session;
}

/** 한 사용자의 모든 세션과 토큰을 끊는다 (정지, 콘솔의 "세션 모두 끊기", 탈퇴) */
export async function endAllSessions(serviceId: string, userId: string, except?: string) {
  const prisma = getPrisma();
  await prisma.refreshToken.updateMany({
    where: {
      serviceId,
      userId,
      revokedAt: null,
      // sessionId가 없는 옛 토큰도 끊어야 하니 null을 따로 넣는다 (NOT은 null을 빼 버린다)
      ...(except ? { OR: [{ sessionId: null }, { sessionId: { not: except } }] } : {}),
    },
    data: { revokedAt: new Date() },
  });
  await prisma.session.deleteMany({ where: { serviceId, userId, ...(except ? { NOT: { id: except } } : {}) } });
}

/** 이 브라우저에서 로그인 유지 중인 계정들 (계정 화면에서 앱을 고를 때). 만료, 정지, 허용 목록 밖은 뺀다. */
export async function browserAccounts(browserKey: string | null | undefined) {
  if (!browserKey) return [];
  const sessions = await getPrisma().session.findMany({
    where: { browserHash: await hashSecret(browserKey), expiresAt: { gt: new Date() } },
    include: { user: true, service: true },
    orderBy: { lastSeenAt: "desc" },
  });
  return sessions.filter((s) => !s.user.disabledAt && isEmailAllowed(s.service, s.user.email));
}

/** 이 브라우저의 모든 서비스 로그아웃 (어느 서비스인지 모를 때) */
export async function endBrowserSessions(browserKey: string | null | undefined) {
  if (!browserKey) return;
  const prisma = getPrisma();
  const sessions = await prisma.session.findMany({ where: { browserHash: await hashSecret(browserKey) } });
  for (const session of sessions) await revokeSessionTokens(session.id);
  await prisma.session.deleteMany({ where: { id: { in: sessions.map((s) => s.id) } } });
}
