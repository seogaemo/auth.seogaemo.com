"use client";

import { useActionState, useEffect, useState, useTransition } from "react";

import { changePassword, deleteAccount, removePasskey, signOutOtherDevices, type AccountState } from "@/actions/account";
import { LoginButton, LoginError, LoginField } from "@/components/login/fields";

function useNavigate(state: AccountState) {
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);
}

/** 성공 알림. 영역을 먼저 그려 둬야 스크린 리더가 바뀐 글자를 읽는다. */
function Done({ children }: { children?: string }) {
  return (
    <div role="status" className={children ? "" : "-mb-3"}>
      {children && <p className="border-l-4 border-[#34c759] bg-[#effaf2] px-3 py-2 text-footnote text-[#1d7a3a]">{children}</p>}
    </div>
  );
}

export function PasswordForm({ clientId, hasPassword }: { clientId: string; hasPassword: boolean }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(changePassword.bind(null, clientId), null);
  useNavigate(state);

  return (
    <form key={state?.message ?? ""} action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error}</LoginError>
      <Done>{state?.message}</Done>
      {hasPassword && (
        <LoginField label="현재 비밀번호" id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      )}
      <LoginField
        label={hasPassword ? "새 비밀번호" : "비밀번호"}
        id="newPassword"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="8자 이상"
      />
      <LoginButton type="submit" variant="secondary" disabled={pending}>
        {pending ? "저장 중" : hasPassword ? "비밀번호 바꾸기" : "비밀번호 만들기"}
      </LoginButton>
    </form>
  );
}

/** 패스키 한 줄의 삭제 버튼 */
export function RemovePasskeyButton({ clientId, passkeyId }: { clientId: string; passkeyId: string }) {
  const [state, setState] = useState<AccountState>(null);
  const [pending, start] = useTransition();
  useNavigate(state);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("이 패스키를 삭제할까요? 모든 Seogaemo 서비스에서 이 패스키로 로그인할 수 없게 돼요.")) return;
          start(async () => setState(await removePasskey(clientId, passkeyId)));
        }}
        className="whitespace-nowrap rounded-sm font-mono text-[13px] font-[500] tracking-[-0.04em] text-[#b2231a] underline decoration-1 underline-offset-[3px] hover:text-[#ff3b30] disabled:opacity-50"
      >
        {pending ? "삭제 중" : "삭제"}
      </button>
      {state?.error && <p className="text-label text-[#b2231a]">{state.error}</p>}
    </div>
  );
}

export function SignOutOthersButton({ clientId }: { clientId: string }) {
  const [state, setState] = useState<AccountState>(null);
  const [pending, start] = useTransition();
  useNavigate(state);

  return (
    <div className="flex flex-col gap-3">
      <Done>{state?.message}</Done>
      <LoginButton
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => start(async () => setState(await signOutOtherDevices(clientId)))}
      >
        {pending ? "끊는 중" : "다른 기기 모두 로그아웃"}
      </LoginButton>
    </div>
  );
}

export function DeleteAccountForm({ clientId, confirmText }: { clientId: string; confirmText: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(deleteAccount.bind(null, clientId), null);
  useNavigate(state);

  return (
    <form action={action} className="flex flex-col gap-3">
      <LoginError>{state?.error}</LoginError>
      <LoginField
        label="확인"
        id="confirm"
        name="confirm"
        autoComplete="off"
        required
        placeholder={confirmText}
        hint={`탈퇴하려면 그대로 입력하세요: ${confirmText}`}
      />
      <button
        type="submit"
        disabled={pending || Boolean(state?.redirectTo)}
        className="flex h-12 w-full items-center justify-center border-2 border-[rgba(0,0,0,0.2)] bg-[var(--button-danger)] shadow-[0_3px_0_0_#b2231a] transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none disabled:opacity-60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3b30] focus-visible:ring-offset-2"
      >
        <span className="font-mono text-[15px] font-[600] tracking-[-0.06em] text-white">{pending ? "탈퇴하는 중" : "탈퇴하기"}</span>
      </button>
    </form>
  );
}
