import type { EmailCode, LoginTransaction, Service } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { LIMITS, TTL } from "./config";
import { hashSecret, timingSafeEqual } from "./crypto";
import { emailCodeMessage, sendMail, type EmailCodePurpose } from "./mail";
import { burnPasswordTime, hashPassword, verifyPassword } from "./password";
import { refreshFromGravatarInBackground } from "./gravatar";
import { upsertUserFromProfile } from "./oauth/users";

export function normalizeEmail(value: FormDataEntryValue | null) {
  const email = String(value ?? "").trim().toLowerCase();
  // 실제 검증은 메일 코드로 한다. 여기서는 모양만 본다.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export function checkPasswordRule(password: string) {
  if (password.length < LIMITS.passwordMinLength) {
    return `비밀번호는 ${LIMITS.passwordMinLength}자 이상이어야 해요.`;
  }
  if (password.length > 128) return "비밀번호는 128자까지 쓸 수 있어요.";
  return null;
}

/** 균등한 6자리 숫자 */
function randomCode() {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

function passwordIdentity(serviceId: string, email: string) {
  return getPrisma().identity.findUnique({
    where: {
      serviceId_provider_providerUserId: { serviceId, provider: "password", providerUserId: email },
    },
  });
}

export async function hasPasswordAccount(serviceId: string, email: string) {
  return (await passwordIdentity(serviceId, email)) !== null;
}

export type SendCodeResult = { ok: true; codeId: string } | { ok: false; error: string };

/**
 * 인증 코드를 만들어 메일로 보낸다. 같은 이메일에는 30초에 한 번, 한 시간에 5번까지.
 * send = false면 코드는 만들되 메일은 보내지 않는다 (가입되지 않은 이메일의 비밀번호 재설정:
 * 가입 여부를 알려주지 않기 위해 화면은 똑같이 진행시킨다).
 */
export async function sendEmailCode(params: {
  service: Service;
  transaction: LoginTransaction;
  purpose: EmailCodePurpose;
  email: string;
  pendingPasswordHash?: string;
  send?: boolean;
}): Promise<SendCodeResult> {
  const { service, transaction, purpose, email, pendingPasswordHash, send = true } = params;
  const prisma = getPrisma();
  const now = Date.now();

  const recent = await prisma.emailCode.findMany({
    where: { serviceId: service.id, email, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent.length >= LIMITS.emailCodesPerHour) {
    return { ok: false, error: "코드를 너무 많이 요청했어요. 잠시 후 다시 시도하세요." };
  }
  if (recent[0] && now - recent[0].createdAt.getTime() < TTL.emailCodeCooldownMs) {
    return { ok: false, error: "방금 코드를 보냈어요. 30초 뒤에 다시 요청하세요." };
  }

  const code = randomCode();
  const record = await prisma.emailCode.create({
    data: {
      serviceId: service.id,
      transactionId: transaction.id,
      purpose,
      email,
      codeHash: await hashSecret(code),
      pendingPasswordHash,
      expiresAt: new Date(now + TTL.emailCodeMs),
    },
  });

  if (send) {
    try {
      await sendMail({ to: email, ...emailCodeMessage(purpose, service.name, code) });
    } catch (error) {
      console.error("send mail failed", error);
      await prisma.emailCode.delete({ where: { id: record.id } });
      return { ok: false, error: "메일을 보내지 못했어요. 잠시 후 다시 시도하세요." };
    }
  }

  return { ok: true, codeId: record.id };
}

/** 확인 중인 코드 (입력 화면 표시용). 다른 로그인 진행의 코드면 null. */
export async function findPendingCode(codeId: string | undefined, transactionId: string) {
  if (!codeId) return null;
  const record = await getPrisma().emailCode.findUnique({ where: { id: codeId } });
  if (!record || record.transactionId !== transactionId || record.consumedAt) return null;
  return record;
}

export type VerifyCodeResult = { ok: true; record: EmailCode } | { ok: false; error: string };

export async function verifyEmailCode(record: EmailCode, code: string): Promise<VerifyCodeResult> {
  const prisma = getPrisma();
  if (record.expiresAt < new Date()) {
    return { ok: false, error: "코드가 만료됐어요. 새 코드를 받으세요." };
  }
  if (record.attempts >= LIMITS.emailCodeAttempts) {
    return { ok: false, error: "너무 많이 틀렸어요. 새 코드를 받으세요." };
  }

  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== 6 || !timingSafeEqual(await hashSecret(normalized), record.codeHash)) {
    await prisma.emailCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    const left = LIMITS.emailCodeAttempts - record.attempts - 1;
    return {
      ok: false,
      error: left > 0 ? `코드가 맞지 않아요. ${left}번 더 시도할 수 있어요.` : "너무 많이 틀렸어요. 새 코드를 받으세요.",
    };
  }

  // 동시에 두 번 써도 한 번만 성공한다
  const { count } = await prisma.emailCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count !== 1) return { ok: false, error: "이미 사용한 코드예요. 새 코드를 받으세요." };

  return { ok: true, record };
}

/**
 * 메일 인증이 끝난 이메일로 사용자를 확정한다. 메일을 받은 사람이니 검증된 이메일로 본다.
 * provider: email(코드 로그인) 또는 password(회원가입)
 */
export async function userForVerifiedEmail(
  serviceId: string,
  provider: "email" | "password",
  email: string,
  passwordHash?: string,
) {
  const user = await upsertUserFromProfile(serviceId, provider, {
    id: email,
    email,
    emailVerified: true,
  });

  if (provider === "password" && passwordHash) {
    await getPrisma().identity.update({
      where: {
        serviceId_provider_providerUserId: { serviceId, provider: "password", providerUserId: email },
      },
      data: { passwordHash, failedAttempts: 0, lockedUntil: null },
    });
  }
  return user;
}

export async function resetPassword(serviceId: string, email: string, password: string) {
  const identity = await passwordIdentity(serviceId, email);
  if (!identity) return null;

  await getPrisma().identity.update({
    where: { id: identity.id },
    data: { passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null },
  });
  return identity.userId;
}

export type PasswordLoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: string; reason: "wrong_password" | "locked" };

const WRONG_CREDENTIALS = "이메일 또는 비밀번호가 맞지 않아요.";

/** 5번 연속 틀리면 15분 잠근다. 계정이 없어도 같은 문구, 비슷한 시간으로 답한다. */
export async function loginWithPassword(
  serviceId: string,
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  const prisma = getPrisma();
  const identity = await passwordIdentity(serviceId, email);

  if (!identity?.passwordHash) {
    await burnPasswordTime(password);
    return { ok: false, error: WRONG_CREDENTIALS, reason: "wrong_password" };
  }
  if (identity.lockedUntil && identity.lockedUntil > new Date()) {
    return { ok: false, error: "비밀번호를 여러 번 틀려서 잠시 잠겼어요. 15분 뒤에 다시 시도하거나 비밀번호를 재설정하세요.", reason: "locked" };
  }

  if (!(await verifyPassword(password, identity.passwordHash))) {
    const failed = identity.failedAttempts + 1;
    await prisma.identity.update({
      where: { id: identity.id },
      data:
        failed >= LIMITS.passwordAttempts
          ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LIMITS.passwordLockMs) }
          : { failedAttempts: failed },
    });
    return { ok: false, error: WRONG_CREDENTIALS, reason: "wrong_password" };
  }

  await prisma.identity.update({
    where: { id: identity.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });
  const user = await prisma.user.update({ where: { id: identity.userId }, data: { lastLoginAt: new Date() } });
  refreshFromGravatarInBackground(user);
  return { ok: true, userId: identity.userId };
}
