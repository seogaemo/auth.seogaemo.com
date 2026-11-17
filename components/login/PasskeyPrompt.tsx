"use client";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState } from "react";

import { passkeyRegisterOptions, passkeyRegisterVerify, passkeySkip, type PasskeyResult } from "@/actions/login";
import { LoginButton, LoginError } from "./fields";

type Failure = { name?: string; code?: string; cause?: { name?: string } };

/** 사용자가 창을 닫거나 취소한 경우 (브라우저는 이유를 구분해 주지 않고 NotAllowedError로 알린다) */
function isCancelled(error: unknown) {
  const { name, code, cause } = (error ?? {}) as Failure;
  return name === "NotAllowedError" || cause?.name === "NotAllowedError" || code === "ERROR_CEREMONY_ABORTED";
}

/** 로그인 직후 패스키 저장 제안. 저장하든 건너뛰든 끝나면 로그인이 마무리되어 서비스로 돌아간다. */
export function PasskeyPrompt() {
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** 이동하면 true. 오류면 화면에 보이고 버튼을 다시 연다. */
  function settle(result: PasskeyResult<unknown>) {
    if (result.redirectTo) {
      setNavigating(true);
      window.location.assign(result.redirectTo);
      return true;
    }
    if (result.error) setError(result.error);
    setBusy(null);
    return false;
  }

  async function skip() {
    setBusy("skip");
    setError(null);
    settle(await passkeySkip());
  }

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);

    const prepared = await passkeyRegisterOptions();
    if (!prepared.options) {
      settle(prepared);
      return;
    }

    let credential;
    try {
      credential = await startRegistration({ optionsJSON: prepared.options });
    } catch (e) {
      if (isCancelled(e)) return void (await skip());
      if ((e as Failure).code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
        setNotice("이미 저장돼 있어요.");
        return void (await skip());
      }
      console.warn("passkey registration failed", e);
      setError("패스키를 저장하지 못했어요. 다시 시도하거나 건너뛰세요.");
      setBusy(null);
      return;
    }
    settle(await passkeyRegisterVerify(credential));
  }

  // 패스키를 못 쓰는 브라우저면 묻지 않고 로그인을 마친다
  useEffect(() => {
    if (!browserSupportsWebAuthn()) void skip();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const disabled = busy !== null || navigating;

  return (
    <div className="flex flex-col gap-3">
      <LoginError>{error}</LoginError>
      <div role="status" className={notice ? "" : "-mb-3"}>
        {notice && <p className="border-l-4 border-[#34c759] bg-[#effaf2] px-3 py-2 text-footnote text-[#1d7a3a]">{notice}</p>}
      </div>
      <LoginButton type="button" disabled={disabled} onClick={save} autoFocus>
        {busy === "save" ? "저장 중" : "저장하기"}
      </LoginButton>
      <LoginButton type="button" variant="secondary" disabled={disabled} onClick={skip}>
        {busy === "skip" ? "넘어가는 중" : "건너뛰기"}
      </LoginButton>
    </div>
  );
}
