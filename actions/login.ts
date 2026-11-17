"use server";

import { cookies } from "next/headers";

import { isEmailAllowed, NOT_ALLOWED_MESSAGE } from "@/lib/allowlist";
import {
  EMAIL_CODE_COOKIE,
  LOGIN_EMAIL_COOKIE,
  LOGIN_TX_COOKIE,
  TTL,
  type Provider,
} from "@/lib/config";
import {
  checkPasswordRule,
  findPendingCode,
  hasPasswordAccount,
  loginWithPassword,
  normalizeEmail,
  resetPassword,
  sendEmailCode,
  userForVerifiedEmail,
  verifyEmailCode,
} from "@/lib/email-auth";
import type { EmailCodePurpose } from "@/lib/mail";
import { continueWithSession, finishLogin } from "@/lib/oauth/complete";
import { currentBrowserKey, findSession } from "@/lib/oauth/session";
import { getPrisma } from "@/cloudflare";
import { isProviderConfigured } from "@/lib/oauth/providers";
import { findActiveTransaction } from "@/lib/oauth/transaction";
import { hashPassword } from "@/lib/password";
import { getProviders } from "@/lib/service";
import { recordLoginEvent } from "@/lib/events";
import { isRateLimited, RATE_LIMITED_MESSAGE } from "@/lib/rate-limit";
import { SignupBlockedError, signupBlock, signupBlockMessage, userExists } from "@/lib/signup-policy";
import { TURNSTILE_MESSAGE, verifyTurnstile } from "@/lib/turnstile";

export type LoginFormState = {
  error?: string;
  email?: string;
  /** 성공하면 브라우저가 이 주소로 이동한다 (서버 액션 안의 redirect()는 OpenNext에서 404가 난다) */
  redirectTo?: string;
} | null;

class Navigate {
  constructor(readonly to: string) {}
}

/** 액션 본문에서 바로 빠져나가 이동시킨다 */
function navigate(to: string): never {
  throw new Navigate(to);
}

/**
 * 액션 공통: IP별 시도 제한을 먼저 보고, 본문에서 던진 이동(Navigate)을 응답으로 바꾼다.
 */
function run(fn: () => Promise<LoginFormState>): Promise<LoginFormState> {
  return (async () => {
    if (await isRateLimited()) {
      const transaction = await currentTransaction();
      if (transaction) {
        await recordLoginEvent({ serviceId: transaction.serviceId, type: "failure", reason: "rate_limited" });
      }
      return { error: RATE_LIMITED_MESSAGE };
    }
    return fn();
  })().catch((error) => {
    if (error instanceof Navigate) return { redirectTo: error.to };
    throw error;
  });
}

/** 가입이 막힌 경우 (가입 설정) 사용자에게 보여줄 문구 */
function signupError(
  transaction: NonNullable<Awaited<ReturnType<typeof currentTransaction>>>,
  error: unknown,
  email?: string,
): LoginFormState {
  if (error instanceof SignupBlockedError) {
    return { error: signupBlockMessage(transaction.service, error.block), email };
  }
  throw error;
}

async function currentTransaction() {
  return findActiveTransaction((await cookies()).get(LOGIN_TX_COOKIE)?.value);
}

/** 진행 중인 로그인과, 그 서비스에서 이 로그인 방식을 쓸 수 있는지 확인한다 */
async function requireLogin(provider: Provider) {
  const transaction = await currentTransaction();
  if (!transaction) navigate("/login/error?code=expired");
  if (
    !getProviders(transaction.service).includes(provider) ||
    !isProviderConfigured(provider)
  ) {
    navigate("/login");
  }
  return transaction;
}

async function complete(
  transaction: Parameters<typeof finishLogin>[0],
  userId: string,
  method: Provider,
) {
  const url = await finishLogin(transaction, userId, method);
  // 쿠키는 여기서 지우지 않는다. 액션에서 쿠키를 바꾸면 Next가 지금 페이지를 다시 그리는데,
  // 로그인 진행이 이미 끝나서 "만료" 화면으로 먼저 넘어가 버린다. DB의 진행 기록은
  // finishLogin에서 지워졌으니 남은 쿠키는 쓸모가 없고, 10분 뒤 사라진다.
  navigate(url);
}

/** 첫 단계에서 입력한 이메일을 다음 단계로 넘긴다 */
async function rememberEmail(email: string) {
  (await cookies()).set(LOGIN_EMAIL_COOKIE, email, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/login",
    maxAge: TTL.emailCodeMs / 1000,
  });
}

async function savedEmail() {
  return normalizeEmail((await cookies()).get(LOGIN_EMAIL_COOKIE)?.value ?? null);
}

type ActiveTransaction = NonNullable<Awaited<ReturnType<typeof currentTransaction>>>;

/** 허용 목록이 켜진 서비스에서 목록 밖 이메일이면 오류 상태, 아니면 null */
function blockedEmail(transaction: ActiveTransaction, email: string): LoginFormState {
  return isEmailAllowed(transaction.service, email) ? null : { error: NOT_ALLOWED_MESSAGE, email };
}

function enabledProviders(transaction: ActiveTransaction) {
  return getProviders(transaction.service).filter(isProviderConfigured);
}

async function sendLoginCodeTo(
  transaction: ActiveTransaction,
  email: string,
): Promise<LoginFormState> {
  const blocked = blockedEmail(transaction, email);
  if (blocked) return blocked;
  const result = await sendEmailCode({
    service: transaction.service,
    transaction,
    purpose: "login",
    email,
  });
  if (!result.ok) return { error: result.error, email };
  await goToVerify(result.codeId);
  return null;
}

/**
 * 첫 단계: 이메일만 받고 다음 화면을 고른다.
 * 비밀번호가 있는 계정이면 비밀번호 화면, 아니면 이메일 코드(꺼져 있으면 가입 화면).
 */
export async function continueWithEmail(
  _prev: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await currentTransaction();
    if (!transaction) navigate("/login/error?code=expired");
    const providers = enabledProviders(transaction);
    const passwordOn = providers.includes("password");
    const emailOn = providers.includes("email");
    if (!passwordOn && !emailOn) navigate("/login");

    const email = normalizeEmail(form.get("email"));
    if (!email) return { error: "name@example.com 형식으로 이메일을 입력하세요." };
    if (!(await verifyTurnstile(form))) return { error: TURNSTILE_MESSAGE, email };
    await rememberEmail(email);
    const blocked = blockedEmail(transaction, email);
    if (blocked) return blocked;

    if (passwordOn && (await hasPasswordAccount(transaction.serviceId, email))) {
      navigate("/login/password");
    }
    // 처음 보는 이메일인데 가입이 막혀 있으면 코드를 보내기 전에 알려준다
    if (!(await userExists(transaction.serviceId, email))) {
      const block = signupBlock(transaction.service);
      if (block) return { error: signupBlockMessage(transaction.service, block), email };
    }
    if (emailOn) return sendLoginCodeTo(transaction, email);
    navigate("/login/signup");
  });
}

/** 비밀번호 화면의 "이메일 코드로 로그인" */
export async function emailCodeInstead(): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await requireLogin("email");
    const email = await savedEmail();
    if (!email) navigate("/login");
    return sendLoginCodeTo(transaction, email);
  });
}

async function goToVerify(codeId: string) {
  (await cookies()).set(EMAIL_CODE_COOKIE, codeId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/login",
    maxAge: TTL.emailCodeMs / 1000,
  });
  navigate("/login/verify");
}

export async function passwordLogin(
  _prev: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await requireLogin("password");
    const email = await savedEmail();
    if (!email) navigate("/login");
    const password = String(form.get("password") ?? "");
    if (!password) return { error: "비밀번호를 입력하세요." };
    const blocked = blockedEmail(transaction, email);
    if (blocked) return blocked;

    const result = await loginWithPassword(
      transaction.serviceId,
      email,
      password,
    );
    if (!result.ok) {
      await recordLoginEvent({ serviceId: transaction.serviceId, type: "failure", email, method: "password", reason: result.reason });
      return { error: result.error, email };
    }

    await complete(transaction, result.userId, "password");
    return null;
  });
}

export async function startSignup(
  _prev: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await requireLogin("password");
    const email = normalizeEmail(form.get("email"));
    const password = String(form.get("password") ?? "");
    if (!email) return { error: "name@example.com 형식으로 이메일을 입력하세요." };
    if (!(await verifyTurnstile(form))) return { error: TURNSTILE_MESSAGE, email };

    await rememberEmail(email);
    const blocked = blockedEmail(transaction, email);
    if (blocked) return blocked;
    if (!(await userExists(transaction.serviceId, email))) {
      const block = signupBlock(transaction.service);
      if (block) return { error: signupBlockMessage(transaction.service, block), email };
    }
    const rule = checkPasswordRule(password);
    if (rule) return { error: rule, email };
    if (await hasPasswordAccount(transaction.serviceId, email)) {
      return {
        error:
          "이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정하세요.",
        email,
      };
    }

    const result = await sendEmailCode({
      service: transaction.service,
      transaction,
      purpose: "signup",
      email,
      pendingPasswordHash: await hashPassword(password),
    });
    if (!result.ok) return { error: result.error, email };
    await goToVerify(result.codeId);
    return null;
  });
}

export async function startReset(
  _prev: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await requireLogin("password");
    const email = normalizeEmail(form.get("email"));
    if (!email) return { error: "name@example.com 형식으로 이메일을 입력하세요." };
    if (!(await verifyTurnstile(form))) return { error: TURNSTILE_MESSAGE, email };

    const blocked = blockedEmail(transaction, email);
    if (blocked) return blocked;

    // 가입되지 않은 이메일이어도 같은 화면으로 보낸다 (가입 여부를 알려주지 않는다)
    const exists = await hasPasswordAccount(transaction.serviceId, email);
    const result = await sendEmailCode({
      service: transaction.service,
      transaction,
      purpose: "reset",
      email,
      send: exists,
    });
    if (!result.ok) return { error: result.error, email };
    await goToVerify(result.codeId);
    return null;
  });
}

const PURPOSE_PROVIDER: Record<EmailCodePurpose, Provider> = {
  signup: "password",
  reset: "password",
  login: "email",
};

export async function verifyCode(
  _prev: LoginFormState,
  form: FormData,
): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await currentTransaction();
    if (!transaction) navigate("/login/error?code=expired");

    const record = await findPendingCode(
      (await cookies()).get(EMAIL_CODE_COOKIE)?.value,
      transaction.id,
    );
    if (!record) navigate("/login");
    const purpose = record.purpose as EmailCodePurpose;
    await requireLogin(PURPOSE_PROVIDER[purpose]);
    // 코드를 보낸 뒤에 허용 목록이 바뀌었을 수 있다
    const blocked = blockedEmail(transaction, record.email);
    if (blocked) return blocked;

    const newPassword = String(form.get("newPassword") ?? "");
    if (purpose === "reset") {
      const rule = checkPasswordRule(newPassword);
      if (rule) return { error: rule };
    }

    const result = await verifyEmailCode(
      record,
      String(form.get("code") ?? ""),
    );
    if (!result.ok) {
      await recordLoginEvent({
        serviceId: transaction.serviceId,
        type: "failure",
        email: record.email,
        method: PURPOSE_PROVIDER[purpose],
        reason: "wrong_code",
      });
      return { error: result.error };
    }

    let userId: string | null;
    try {
      if (purpose === "signup") {
        userId = (
          await userForVerifiedEmail(
            transaction.serviceId,
            "password",
            record.email,
            record.pendingPasswordHash ?? undefined,
          )
        ).id;
      } else if (purpose === "login") {
        userId = (
          await userForVerifiedEmail(transaction.serviceId, "email", record.email)
        ).id;
      } else {
        userId = null;
      }
    } catch (error) {
      return signupError(transaction, error);
    }
    if (purpose === "reset") {
      userId = await resetPassword(
        transaction.serviceId,
        record.email,
        newPassword,
      );
      // 계정이 없는 이메일이면 메일을 안 보냈으니 여기까지 올 수 없다
      if (!userId) return { error: "코드가 맞지 않아요. 메일로 받은 6자리를 다시 확인하세요." };
    }

    await complete(transaction, userId!, PURPOSE_PROVIDER[purpose]);
    return null;
  });
}

export async function resendCode(): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await currentTransaction();
    if (!transaction) navigate("/login/error?code=expired");
    const record = await findPendingCode(
      (await cookies()).get(EMAIL_CODE_COOKIE)?.value,
      transaction.id,
    );
    if (!record) navigate("/login");

    const purpose = record.purpose as EmailCodePurpose;
    const blocked = blockedEmail(transaction, record.email);
    if (blocked) return blocked;
    const send =
      purpose !== "reset" ||
      (await hasPasswordAccount(transaction.serviceId, record.email));
    const result = await sendEmailCode({
      service: transaction.service,
      transaction,
      purpose,
      email: record.email,
      pendingPasswordHash: record.pendingPasswordHash ?? undefined,
      send,
    });
    if (!result.ok) return { error: result.error };
    await goToVerify(result.codeId);
    return null;
  });
}

/** "이 계정으로 계속" (prompt=select_account): 살아 있는 세션으로 code를 준다 */
export async function continueAsCurrent(): Promise<LoginFormState> {
  return run(async () => {
    const transaction = await currentTransaction();
    if (!transaction) navigate("/login/error?code=expired");
    const session = await findSession(await currentBrowserKey(), transaction.serviceId);
    if (!session) navigate("/login");

    await getPrisma().loginTransaction.deleteMany({ where: { id: transaction.id } });
    navigate(await continueWithSession(transaction, session));
  });
}
