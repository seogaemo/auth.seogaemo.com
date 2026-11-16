"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import {
  passwordLogin,
  resendCode,
  startEmailLogin,
  startReset,
  startSignup,
  verifyCode,
  type LoginFormState,
} from "@/actions/login";
import { LoginButton, LoginError, LoginField, LoginTextLink } from "./fields";

/** 액션이 이동할 주소를 돌려주면 브라우저가 직접 이동한다 (외부 redirect_uri 포함) */
function useNavigate(state: LoginFormState) {
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);
  return Boolean(state?.redirectTo);
}

export function PasswordLoginForm({ canSignup }: { canSignup: boolean }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(passwordLogin, null);
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <LoginError>{state.error}</LoginError>}
      <LoginField
        label="이메일"
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state?.email}
        placeholder="name@example.com"
      />
      <LoginField
        label="비밀번호"
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <div className="pt-1">
        <LoginButton type="submit" disabled={pending || navigating}>
          {pending ? "확인 중" : "로그인"}
        </LoginButton>
      </div>
      <div className="flex items-center justify-between pt-1">
        <LoginTextLink href="/login/reset">비밀번호를 잊으셨나요?</LoginTextLink>
        {canSignup && <LoginTextLink href="/login/signup">회원가입 →</LoginTextLink>}
      </div>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(startSignup, null);
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <LoginError>{state.error}</LoginError>}
      <LoginField
        label="이메일"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.email}
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
      <div className="pt-1">
        <LoginButton type="submit" disabled={pending || navigating}>
          {pending ? "메일 보내는 중" : "인증 코드 받기"}
        </LoginButton>
      </div>
    </form>
  );
}

/** 이메일만 받아 코드를 보낸다 (이메일 코드 로그인, 비밀번호 재설정) */
export function EmailCodeRequestForm({ purpose }: { purpose: "login" | "reset" }) {
  const [state, action, pending] = useActionState<LoginFormState, FormData>(
    purpose === "login" ? startEmailLogin : startReset,
    null,
  );
  const navigating = useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error && <LoginError>{state.error}</LoginError>}
      <LoginField
        label="이메일"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state?.email}
        placeholder="name@example.com"
      />
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
      {(state?.error || resendError) && <LoginError>{state?.error ?? resendError}</LoginError>}
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
          placeholder="000000"
          className="h-14 w-full border-2 border-[rgba(0,0,0,0.12)] bg-white text-center font-mono text-[28px] font-[600] tracking-[0.4em] text-[#101016] placeholder:text-[#e7e7e9] focus:border-login-brand focus:outline-none"
        />
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
