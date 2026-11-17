"use client";

import { useActionState } from "react";

import { updateIdTokenAlg, type ActionState } from "@/actions/services";
import { Button, FormFeedback } from "./ui";

const OPTIONS = [
  { value: "RS256", title: "RS256", description: "OIDC 기본값. 대부분의 라이브러리가 따로 설정 없이 받아요." },
  { value: "ES256", title: "ES256", description: "더 짧은 서명. 라이브러리에 ES256을 쓴다고 알려야 하는 경우가 있어요." },
] as const;

/** 이 앱에 주는 ID 토큰의 서명 알고리즘. 키는 둘 다 JWKS에 있다 */
export function IdTokenAlgForm({ serviceId, alg }: { serviceId: string; alg: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateIdTokenAlg.bind(null, serviceId), null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormFeedback error={state?.error} message={state?.message} />
      <fieldset className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
        <legend className="sr-only">ID 토큰 서명</legend>
        <span aria-hidden className="shrink-0 text-footnote text-tertiary sm:w-28 sm:pt-[10px]">
          ID 토큰 서명
        </span>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer flex-col gap-0.5 rounded-lg border-2 border-base px-3 py-2.5 transition-colors hover:bg-base has-[:checked]:border-accent has-[:checked]:bg-accent-elevated has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--content-accent)]"
            >
              <input type="radio" name="idTokenSigningAlg" value={option.value} defaultChecked={alg === option.value} className="sr-only" />
              <span className="font-mono text-footnote font-strong text-primary">{option.title}</span>
              <span className="text-label text-tertiary">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "저장 중" : "서명 방식 저장"}
        </Button>
      </div>
    </form>
  );
}
