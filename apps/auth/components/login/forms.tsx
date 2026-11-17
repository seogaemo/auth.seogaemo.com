"use client";

import {
  browserSupportsWebAuthnAutofill,
  sendSignal,
  startAuthentication,
  WebAuthnAbortService,
} from "@simplewebauthn/browser";
import { useActionState, useEffect, useState, useTransition } from "react";

import {
  continueAsCurrent,
  continueWithEmail,
  emailCodeInstead,
  passkeyLogin,
  passkeyLoginOptions,
  passwordLogin,
  resendCode,
  startReset,
  startSignup,
  verifyCode,
  type LoginFormState,
} from "@/actions/login";
import { LoginButton, LoginError, LoginField, LoginTextLink } from "./fields";
import { Turnstile } from "./Turnstile";

/** 액션이 이동할 주소를 돌려주면 브라우저가 직접 이동한다 (외부 redirect_uri 포함) */
function useNavigate(state: LoginFormState) {
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);
  return Boolean(state?.redirectTo);
}

/**
 * 이메일 칸에 저장한 패스키를 자동완성으로 띄운다 (Conditional UI). 버튼을 누르지 않아도 칸을 누르면 목록이 뜨고,
 * 고르면 바로 로그인한다. 이메일 폼을 보내는 중에는 요청을 접고, 끝나면 다시 건다.
 */
function usePasskeyAutofill(enabled: boolean, idle: boolean) {
  const [error, setError] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  // 실패한 뒤에는 이메일 칸을 다시 누를 때 새로 건다 (challenge는 한 번만 쓴다. 바로 다시 걸면 같은 패스키로 계속 실패한다)
  const [armed, setArmed] = useState(true);

  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  useEffect(() => {
    if (!enabled || !idle || redirectTo || !armed) return;
    let active = true;

    (async () => {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      const options = await passkeyLoginOptions();
      if (!active || !options) return;

      let response;
      try {
        response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: true });
      } catch {
        return; // 접었거나(이메일 입력 시작), 고르지 않고 닫았다
      }
      if (!active) return;

      const result = await passkeyLogin(response);
      if (!active) return;
      if (result.redirectTo) return setRedirectTo(result.redirectTo);
      setError(result.error ?? null);
      if (result.unknownCredentialId) {
        // 서버에서 지운 패스키가 기기에 남아 있으면 지우라고 브라우저에 알린다 (지원하는 브라우저만)
        sendSignal({
          signalName: "unknownCredential",
          rpID: window.location.hostname,
          credentialID: result.unknownCredentialId,
        }).catch(() => {});
      }
      setArmed(false);
    })().catch((e) => console.warn("passkey autofill failed", e));

    return () => {
      active = false;
      WebAuthnAbortService.cancelCeremony();
    };
  }, [enabled, idle, redirectTo, armed]);

  const rearm = () => setArmed(true);
  return { error, navigating: redirectTo !== null, inputProps: { onFocus: rearm, onClick: rearm } };
}

/** 첫 단계: 이메일만 받는다. 다음 화면은 서버가 계정에 맞춰 고른다. */
export function EmailStartForm({
  defaultEmail,
  canSignup,
  passkey,
  turnstileKey,
}: {
  defaultEmail?: string;
  canSignup: boolean;
  /** 패스키로 로그인할 수 있는 서비스 */
  passkey: boolean;
  turnstileKey?: string | null;
}) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(continueWithEmail, null);
  const formNavigating = useNavigate(state);
  const autofill = usePasskeyAutofill(passkey, !pending && !formNavigating);
  const navigating = formNavigating || autofill.navigating;

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error ?? autofill.error}</LoginError>
      <LoginField
        label="이메일"
        id="email"
        name="email"
        type="email"
        autoComplete={passkey ? "username webauthn" : "username"}
        autoFocus
        required
        defaultValue={state?.email ?? defaultEmail}
        placeholder="name@example.com"
        {...autofill.inputProps}
        hint={passkey ? "패스키를 저장했다면 이 칸을 눌러 바로 로그인하세요." : undefined}
      />
      {turnstileKey && <Turnstile key={JSON.stringify(state)} siteKey={turnstileKey} />}
      <div className="pt-1">
        <LoginButton type="submit" disabled={pending || navigating}>
          {pending ? "확인 중" : "계속하기"}
        </LoginButton>
      </div>
      {canSignup && (
        <div className="flex justify-end pt-1">
          <LoginTextLink href="/login/signup">회원가입 →</LoginTextLink>
        </div>
      )}
    </form>
  );
}

/** 비밀번호 단계. 이메일은 첫 단계에서 받았고, 비밀번호 관리자를 위해 숨은 칸으로 다시 둔다. */
export function PasswordLoginForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(passwordLogin, null);
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error}</LoginError>
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <LoginField
        label="비밀번호"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
      />
      <div className="pt-1">
        <LoginButton type="submit" disabled={pending || navigating}>
          {pending ? "확인 중" : "로그인"}
        </LoginButton>
      </div>
      <div className="flex justify-end pt-1">
        <LoginTextLink href="/login/reset">비밀번호를 잊으셨나요?</LoginTextLink>
      </div>
    </form>
  );
}

/** 비밀번호 대신 같은 이메일로 코드를 받는다 */
export function EmailCodeInsteadForm() {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(emailCodeInstead, null);
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error}</LoginError>
      <LoginButton type="submit" variant="secondary" icon="/icons/mail.svg" disabled={pending || navigating}>
        {pending ? "메일 보내는 중" : "이메일 코드로 로그인"}
      </LoginButton>
    </form>
  );
}

export function SignupForm({ defaultEmail, turnstileKey }: { defaultEmail?: string; turnstileKey?: string | null }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(startSignup, null);
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error}</LoginError>
      <LoginField
        label="이메일"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.email ?? defaultEmail}
        placeholder="name@example.com"
      />
      <LoginField
        label="비밀번호"
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="8자 이상"
      />
      {turnstileKey && <Turnstile key={JSON.stringify(state)} siteKey={turnstileKey} />}
      <div className="pt-1">
        <LoginButton type="submit" disabled={pending || navigating}>
          {pending ? "메일 보내는 중" : "인증 코드 받기"}
        </LoginButton>
      </div>
    </form>
  );
}

/** 비밀번호 재설정: 이메일을 받아 코드를 보낸다 */
export function ResetRequestForm({ defaultEmail, turnstileKey }: { defaultEmail?: string; turnstileKey?: string | null }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(startReset, null);
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error}</LoginError>
      <LoginField
        label="이메일"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.email ?? defaultEmail}
        placeholder="name@example.com"
      />
      {turnstileKey && <Turnstile key={JSON.stringify(state)} siteKey={turnstileKey} />}
      <div className="pt-1">
        <LoginButton type="submit" disabled={pending || navigating}>
          {pending ? "메일 보내는 중" : "인증 코드 받기"}
        </LoginButton>
      </div>
    </form>
  );
}

export function VerifyCodeForm({ needsNewPassword }: { needsNewPassword: boolean }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(verifyCode, null);
  const navigating = useNavigate(state);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resending, startResend] = useTransition();

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error ?? resendError}</LoginError>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className="font-mono text-[13px] font-[500] tracking-[-0.04em] text-quaternary">
          인증 코드
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          aria-describedby="code-hint"
          placeholder="000000"
          className="h-14 w-full border-2 border-[rgba(0,0,0,0.12)] bg-white text-center font-mono text-[28px] font-[600] tracking-[0.4em] text-[#101016] placeholder:text-[#e7e7e9] focus:border-login-brand focus:outline-none"
        />
        <p id="code-hint" className="sr-only">
          메일로 받은 숫자 6자리
        </p>
      </div>
      {needsNewPassword && (
        <LoginField
          label="새 비밀번호"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="8자 이상"
        />
      )}
      <div className="pt-1">
        <LoginButton type="submit" disabled={pending || navigating}>
          {pending ? "확인 중" : needsNewPassword ? "비밀번호 바꾸고 로그인" : "확인"}
        </LoginButton>
      </div>
      <div className="flex items-center justify-between pt-1">
        <LoginTextLink href="/login">다른 방법으로 로그인</LoginTextLink>
        <button
          type="button"
          disabled={resending}
          onClick={() =>
            startResend(async () => {
              setResendError(null);
              const result = await resendCode();
              if (result?.redirectTo) window.location.assign(result.redirectTo);
              else if (result?.error) setResendError(result.error);
            })
          }
          className="rounded-sm font-mono text-[13px] font-[500] tracking-[-0.04em] text-tertiary underline decoration-1 underline-offset-[3px] hover:text-primary disabled:opacity-50"
        >
          {resending ? "보내는 중" : "코드 다시 받기"}
        </button>
      </div>
    </form>
  );
}

/** 로그인된 계정으로 계속 (계정 선택 화면) */
export function ContinueAsForm({ label }: { label: string }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(() => continueAsCurrent(), null);
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error}</LoginError>
      <p className="border-2 border-[rgba(0,0,0,0.12)] px-3 py-3 font-mono text-[15px] tracking-[-0.02em] text-[#101016] [overflow-wrap:anywhere]">
        {label}
      </p>
      <LoginButton type="submit" disabled={pending || navigating}>
        {pending ? "확인 중" : "이 계정으로 계속"}
      </LoginButton>
    </form>
  );
}
