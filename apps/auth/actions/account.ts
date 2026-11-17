"use server";

import { revalidatePath } from "next/cache";

import { getPrisma } from "@/cloudflare";
import { checkPasswordRule } from "@/lib/email-auth";
import { currentBrowserKey, endAllSessions, findSession } from "@/lib/oauth/session";
import { deletePasskey } from "@/lib/passkey";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isRateLimited, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { findServiceByClientId, getProviders } from "@/lib/service";

export type AccountState = { error?: string; message?: string; redirectTo?: string } | null;

/** 액션에서는 redirect()를 못 쓰니(OpenNext 404) 세션이 없으면 null */
async function account(clientId: string) {
  const service = await findServiceByClientId(clientId);
  if (!service) return null;
  const session = await findSession(await currentBrowserKey(), service.id);
  return session ? { service, session, user: session.user } : null;
}

const loginAgain = (clientId: string): AccountState => ({
  redirectTo: `/account/login?client_id=${encodeURIComponent(clientId)}`,
});

/**
 * 비밀번호 바꾸기. 비밀번호가 없는 계정(코드, 소셜 로그인)은 새로 만든다.
 * 바꾸고 나면 이 기기 말고 다른 기기의 로그인은 끊는다.
 */
export async function changePassword(clientId: string, _prev: AccountState, form: FormData): Promise<AccountState> {
  if (await isRateLimited()) return { error: RATE_LIMITED_MESSAGE };
  const current = await account(clientId);
  if (!current) return loginAgain(clientId);
  const { service, session, user } = current;
  const prisma = getPrisma();

  const next = String(form.get("newPassword") ?? "");
  const rule = checkPasswordRule(next);
  if (rule) return { error: rule };

  const identity = await prisma.identity.findFirst({ where: { userId: user.id, provider: "password" } });
  if (identity?.passwordHash) {
    const now = String(form.get("currentPassword") ?? "");
    if (!now || !(await verifyPassword(now, identity.passwordHash))) {
      return { error: "현재 비밀번호가 맞지 않아요. 다시 입력하거나, 로그아웃한 뒤 비밀번호 재설정을 하세요." };
    }
    await prisma.identity.update({
      where: { id: identity.id },
      data: { passwordHash: await hashPassword(next), failedAttempts: 0, lockedUntil: null },
    });
  } else {
    if (!getProviders(service).includes("password")) {
      return { error: "이 서비스는 비밀번호 로그인을 쓰지 않아요." };
    }
    if (!user.email) return { error: "확인된 이메일이 없는 계정은 비밀번호를 만들 수 없어요." };
    await prisma.identity.create({
      data: {
        serviceId: service.id,
        userId: user.id,
        provider: "password",
        providerUserId: user.email,
        email: user.email,
        passwordHash: await hashPassword(next),
      },
    });
  }

  await endAllSessions(service.id, user.id, session.id);
  revalidatePath("/account");
  return {
    message: identity?.passwordHash
      ? "비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요."
      : "비밀번호를 만들었어요. 이제 이메일과 비밀번호로도 로그인할 수 있어요.",
  };
}

/** 이 기기 말고 다른 기기의 로그인을 모두 끊는다 */
export async function signOutOtherDevices(clientId: string): Promise<AccountState> {
  const current = await account(clientId);
  if (!current) return loginAgain(clientId);
  await endAllSessions(current.service.id, current.user.id, current.session.id);
  revalidatePath("/account");
  return { message: "다른 기기의 로그인을 모두 끊었어요." };
}

/**
 * 패스키 삭제. 패스키는 이메일에 붙어 있어서 모든 Seogaemo 서비스에서 같이 지워진다.
 * 로그인한 사용자의 이메일 소유가 아닌 패스키는 지울 수 없다.
 */
export async function removePasskey(clientId: string, passkeyId: string): Promise<AccountState> {
  const current = await account(clientId);
  if (!current) return loginAgain(clientId);
  if (!current.user.email) return { error: "확인된 이메일이 없는 계정이에요." };
  if (!(await deletePasskey(current.user.email, passkeyId))) return { error: "이미 지워졌거나 찾을 수 없는 패스키예요." };
  revalidatePath("/account");
  return { message: "패스키를 삭제했어요." };
}

/** 탈퇴. 확인으로 이메일(없으면 "탈퇴")을 그대로 입력받는다. 사용자, 로그인 수단, 토큰, 세션이 모두 지워진다. */
export async function deleteAccount(clientId: string, _prev: AccountState, form: FormData): Promise<AccountState> {
  const current = await account(clientId);
  if (!current) return loginAgain(clientId);
  const { service, user } = current;

  // 콘솔 계정: 소유한 앱이 있으면 앱이 주인 없이 남으니 먼저 지워야 한다
  if (service.isSystem) {
    const owned = await getPrisma().service.count({ where: { ownerId: user.id } });
    if (owned > 0) return { error: `소유한 앱이 ${owned}개 있어요. 콘솔에서 앱을 먼저 지운 뒤 탈퇴하세요.` };
  }

  const expected = user.email ?? "탈퇴";
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== expected.toLowerCase()) {
    return { error: `확인 칸에 다음을 그대로 입력하세요: ${expected}` };
  }

  const prisma = getPrisma();
  // 콘솔 계정이면 관리자로 참여한 앱에서도 뺀다 (같은 이메일로 다시 가입해도 자동으로 돌아오지 않게)
  if (service.isSystem && user.email) await prisma.serviceMember.deleteMany({ where: { email: user.email } });
  await prisma.user.delete({ where: { id: user.id } });
  // revalidatePath를 하면 지금 화면(이미 지운 사용자)을 다시 그리다 로그인으로 튄다. 이동만 한다.
  return { redirectTo: `/account/deleted?client_id=${encodeURIComponent(service.clientId)}` };
}
