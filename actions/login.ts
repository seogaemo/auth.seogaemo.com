"use server";

import { cookies } from "next/headers";

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
import { finishLogin } from "@/lib/oauth/complete";
import { isProviderConfigured } from "@/lib/oauth/providers";
import { findActiveTransaction } from "@/lib/oauth/transaction";
import { hashPassword } from "@/lib/password";
import { getProviders } from "@/lib/service";

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

function run(fn: () => Promise<LoginFormState>): Promise<LoginFormState> {
  return fn().catch((error) => {
    if (error instanceof Navigate) return { redirectTo: error.to };
    throw error;
  });
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
) {
  const url = await finishLogin(transaction, userId);
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

function enabledProviders(transaction: NonNullable<Awaited<ReturnType<typeof currentTransaction>>>) {
  return getProviders(transaction.service).filter(isProviderConfigured);
}

async function sendLoginCodeTo(
  transaction: NonNullable<Awaited<ReturnType<typeof currentTransaction>>>,
  email: string,
): Promise<LoginFormState> {
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
    if (!email) return { error: "이메일 주소를 확인하세요." };
    await rememberEmail(email);

    if (passwordOn && (await hasPasswordAccount(transaction.serviceId, email))) {
      navigate("/login/password");
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

    const result = await loginWithPassword(
      transaction.serviceId,
      email,
      password,
    );
    if (!result.ok) return { error: result.error, email };

    await complete(transaction, result.userId);
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
    if (!email) return { error: "이메일 주소를 확인하세요." };

    await rememberEmail(email);
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
    if (!email) return { error: "이메일 주소를 확인하세요." };

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

    const newPassword = String(form.get("newPassword") ?? "");
    if (purpose === "reset") {
      const rule = checkPasswordRule(newPassword);
      if (rule) return { error: rule };
    }

    const result = await verifyEmailCode(
      record,
      String(form.get("code") ?? ""),
    );
    if (!result.ok) return { error: result.error };

    let userId: string | null;
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
      userId = await resetPassword(
        transaction.serviceId,
        record.email,
        newPassword,
      );
      // 계정이 없는 이메일이면 메일을 안 보냈으니 여기까지 올 수 없다
      if (!userId) return { error: "코드가 맞지 않아요." };
    }

    await complete(transaction, userId);
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
