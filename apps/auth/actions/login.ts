"use server";

import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { cookies } from "next/headers";

import { isEmailAllowed, NOT_ALLOWED_MESSAGE } from "@/lib/allowlist";
import {
  EMAIL_CODE_COOKIE,
  LOGIN_EMAIL_COOKIE,
  LOGIN_TX_COOKIE,
  TTL,
  type LoginMethod,
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
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  passkeyAvailable,
  verifyAssertion,
  verifyRegistration,
} from "@/lib/passkey";
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
function run<T extends object | null>(
  fn: () => Promise<T>,
): Promise<T | { error: string } | { redirectTo: string }> {
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

type ActiveTransaction = NonNullable<Awaited<ReturnType<typeof currentTransaction>>>;

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
  method: LoginMethod,
): Promise<never> {
  const url = await finishLogin(transaction, userId, method);
  // 쿠키는 여기서 지우지 않는다. 액션에서 쿠키를 바꾸면 Next가 지금 페이지를 다시 그리는데,
  // 로그인 진행이 이미 끝나서 "만료" 화면으로 먼저 넘어가 버린다. DB의 진행 기록은
  // finishLogin에서 지워졌으니 남은 쿠키는 쓸모가 없고, 10분 뒤 사라진다.
  navigate(url);
}

/**
 * 이메일 코드, 비밀번호 로그인과 가입이 끝난 뒤 호출한다. 패스키를 쓸 수 있는 서비스면 code를 내주기 전에
 * 패스키 저장 제안 화면(/login/passkey)을 거친다. 이 화면은 확인된 사용자와 방식을 로그인 진행에 적어 두고,
 * 저장하든 건너뛰든 거기서 finishLogin을 부른다. authorization code는 5분이면 만료되어서 미리 만들어 두지 않는다.
 */
async function completeOrOfferPasskey(
  transaction: ActiveTransaction,
  userId: string,
  method: LoginMethod,
): Promise<never> {
  if (passkeyAvailable(enabledProviders(transaction))) {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, disabledAt: true } });
    // 패스키는 확인된 이메일에 붙는다. 이메일이 없거나 정지된 사용자는 바로 마친다
    if (user?.email && !user.disabledAt) {
      await prisma.loginTransaction.update({
        where: { id: transaction.id },
        data: {
          verifiedUserId: userId,
          verifiedMethod: method,
          webauthnChallenge: null,
          expiresAt: new Date(Date.now() + TTL.loginTransactionMs),
        },
      });
      navigate("/login/passkey/begin");
    }
  }
  return complete(transaction, userId, method);
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

    await completeOrOfferPasskey(transaction, result.userId, "password");
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

    // 비밀번호 재설정은 패스키를 권하지 않는다
    if (purpose === "reset") await complete(transaction, userId!, PURPOSE_PROVIDER[purpose]);
    await completeOrOfferPasskey(transaction, userId!, PURPOSE_PROVIDER[purpose]);
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

/** 패스키 액션의 응답. 성공하면 options나 redirectTo, 실패하면 error */
export type PasskeyResult<T = never> = {
  options?: T;
  error?: string;
  redirectTo?: string;
  /** 서버에 없는 패스키로 로그인을 시도했을 때 그 credential ID (기기에서 지우라고 알리는 데 쓴다) */
  unknownCredentialId?: string;
};

const PASSKEY_SAVE_FAILED = "패스키를 저장하지 못했어요. 다시 시도하거나 건너뛰세요.";

/** 패스키 저장 제안 화면이 부르는 액션의 공통 확인: 방금 로그인을 확인한 사용자와 그 이메일 */
async function requireVerified() {
  const transaction = await currentTransaction();
  if (!transaction) navigate("/login/error?code=expired");
  const { verifiedUserId: userId, verifiedMethod } = transaction;
  if (!userId || !verifiedMethod || !passkeyAvailable(enabledProviders(transaction))) navigate("/login");
  const method = verifiedMethod as LoginMethod;

  const user = await getPrisma().user.findUnique({ where: { id: userId } });
  // 이메일이 없으면 패스키를 붙일 곳이 없다. 정지된 사용자는 finishLogin이 막는다.
  // 다른 서비스의 사용자가 적혀 있으면 (있을 수 없지만) 로그인을 처음부터 다시 한다
  if (!user || user.serviceId !== transaction.serviceId) navigate("/login");
  if (!user.email) navigate(await finishLogin(transaction, userId, method));
  if (!isEmailAllowed(transaction.service, user.email)) navigate("/login/error?code=not_allowed");
  return { transaction, userId, method, email: user.email };
}

/** 저장하기: 패스키 만들기 옵션을 받는다 */
export async function passkeyRegisterOptions(): Promise<PasskeyResult<PublicKeyCredentialCreationOptionsJSON>> {
  return run(async () => {
    const { transaction, email } = await requireVerified();
    return { options: await createRegistrationOptions(transaction, email) };
  });
}

/** 브라우저가 만든 패스키를 확인해 저장하고 로그인을 마친다 */
export async function passkeyRegisterVerify(response: RegistrationResponseJSON): Promise<PasskeyResult> {
  return run(async () => {
    const { transaction, userId, method, email } = await requireVerified();
    const result = await verifyRegistration(transaction, email, response);
    if (!result.ok) return { error: PASSKEY_SAVE_FAILED };
    return complete(transaction, userId, method);
  });
}

/** 건너뛰기, 취소, 패스키를 못 쓰는 브라우저: 저장 없이 로그인을 마친다 */
export async function passkeySkip(): Promise<PasskeyResult> {
  return run(async () => {
    const { transaction, userId, method } = await requireVerified();
    return complete(transaction, userId, method);
  });
}

/** 로그인 화면이 열릴 때 부른다. 패스키를 쓸 수 없는 서비스면 null */
export async function passkeyLoginOptions(): Promise<PublicKeyCredentialRequestOptionsJSON | null> {
  // 화면을 열 때마다 DB에 challenge를 쓰니 IP별 시도 제한을 같이 받는다
  if (await isRateLimited()) return null;
  const transaction = await currentTransaction();
  if (!transaction || !passkeyAvailable(enabledProviders(transaction))) return null;
  return createAuthenticationOptions(transaction);
}

/**
 * 패스키로 로그인. 패스키를 확인하면 이메일의 주인이 확인된 것으로 보고 (이메일 코드와 같다)
 * 이 서비스의 사용자를 찾는다. 사용자가 없으면 이메일 코드가 켜진 서비스에서만, 가입 설정을 따라 새로 만든다.
 */
export async function passkeyLogin(response: AuthenticationResponseJSON): Promise<PasskeyResult> {
  return run(async () => {
    const transaction = await currentTransaction();
    if (!transaction) navigate("/login/error?code=expired");
    const providers = enabledProviders(transaction);
    if (!passkeyAvailable(providers)) navigate("/login");

    const result = await verifyAssertion(transaction, response);
    if (!result.ok) {
      await recordLoginEvent({
        serviceId: transaction.serviceId,
        type: "failure",
        method: "passkey",
        reason: result.reason === "unknown_credential" ? "unknown_passkey" : "wrong_passkey",
      });
      if (result.reason === "unknown_credential") {
        return {
          error: "서버에 없는 패스키예요. 삭제된 패스키라면 기기에서도 지워 주세요.",
          unknownCredentialId: result.credentialId,
        };
      }
      return { error: "패스키를 확인하지 못했어요. 다시 시도하세요." };
    }

    const { email } = result;
    const blocked = blockedEmail(transaction, email);
    if (blocked) return { error: blocked.error };

    if (!(await userExists(transaction.serviceId, email))) {
      if (!providers.includes("email")) {
        return { error: "이 서비스에 가입된 계정이 없어요. 이메일과 비밀번호로 먼저 가입하세요." };
      }
      const block = signupBlock(transaction.service);
      if (block) return { error: signupBlockMessage(transaction.service, block) };
    }

    let userId: string;
    try {
      userId = (await userForVerifiedEmail(transaction.serviceId, "passkey", email)).id;
    } catch (error) {
      const failed = signupError(transaction, error);
      return { error: failed?.error };
    }
    return complete(transaction, userId, "passkey");
  });
}
