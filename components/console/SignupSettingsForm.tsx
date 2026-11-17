"use client";

import { useActionState } from "react";

import { updateSignupSettings, type ActionState } from "@/actions/services";
import { useLoginDraft } from "./LoginDraft";
import { Button, Card, FormFeedback, FormRow, Input } from "./ui";

interface Props {
  serviceId: string;
  signupEnabled: boolean;
  termsUrl: string | null;
  privacyUrl: string | null;
}

export function SignupSettingsForm({ serviceId, signupEnabled, termsUrl, privacyUrl }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSignupSettings.bind(null, serviceId), null);
  const draft = useLoginDraft();

  return (
    <div className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />
      <form
        key={JSON.stringify(state?.fields ?? {})}
        action={action}
        onChange={(e) => {
          const data = new FormData(e.currentTarget);
          draft({ termsUrl: String(data.get("termsUrl") ?? ""), privacyUrl: String(data.get("privacyUrl") ?? "") });
        }}
        className="flex flex-col gap-4"
      >
        <Card>
          <label className="group flex cursor-pointer items-start gap-3 rounded-lg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--content-accent)] has-[:focus-visible]:ring-offset-2">
            <input type="checkbox" name="signupEnabled" defaultChecked={signupEnabled} className="sr-only" />
            {/* 켜짐을 색만이 아니라 체크 모양으로도 보여준다 */}
            <span
              aria-hidden
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 border-base group-has-[:checked]:border-accent group-has-[:checked]:bg-accent-elevated"
            >
              <svg viewBox="0 0 16 16" width={14} height={14} className="hidden group-has-[:checked]:block">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="text-content-accent" />
              </svg>
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-footnote font-strong text-primary">새 사용자 가입 받기</span>
              <span className="text-label text-tertiary">끄면 이미 가입한 사용자만 로그인할 수 있어요. 이메일, 도메인으로 고르려면 사용자 메뉴의 접근 제한을 쓰세요.</span>
            </span>
          </label>

          <FormRow label="이용약관" htmlFor="termsUrl" hint="로그인 화면 아래에 링크로 보여요.">
            <Input
              id="termsUrl"
              name="termsUrl"
              type="url"
              inputMode="url"
              defaultValue={state?.fields?.termsUrl ?? termsUrl ?? ""}
              placeholder="https://example.com/terms"
            />
          </FormRow>

          <FormRow label="개인정보 처리방침" htmlFor="privacyUrl">
            <Input
              id="privacyUrl"
              name="privacyUrl"
              type="url"
              inputMode="url"
              defaultValue={state?.fields?.privacyUrl ?? privacyUrl ?? ""}
              placeholder="https://example.com/privacy"
            />
          </FormRow>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "저장 중" : "저장"}
          </Button>
        </div>
      </form>
    </div>
  );
}
