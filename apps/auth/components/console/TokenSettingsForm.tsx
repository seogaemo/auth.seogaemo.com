"use client";

import { useActionState } from "react";

import { updateTokenSettings, type ActionState } from "@/actions/services";
import { Button, FormFeedback, FormRow, Input } from "./ui";

const ALGS = [
  { value: "RS256", title: "RS256", description: "OIDC 기본값. 대부분의 라이브러리가 따로 설정 없이 받아요." },
  { value: "ES256", title: "ES256", description: "더 짧은 서명. 라이브러리에 ES256을 쓴다고 알려야 하는 경우가 있어요." },
] as const;

/** 이 앱에 주는 토큰: ID 토큰 서명 알고리즘(키는 둘 다 JWKS에 있다)과 refresh token 회전 유예 시간 */
export function TokenSettingsForm({ serviceId, alg, graceSec }: { serviceId: string; alg: string; graceSec: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateTokenSettings.bind(null, serviceId), null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />
      <fieldset className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
        <legend className="sr-only">ID 토큰 서명</legend>
        <span aria-hidden className="shrink-0 text-footnote text-tertiary sm:w-28 sm:pt-[10px]">
          ID 토큰 서명
        </span>
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          {ALGS.map((option) => (
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
      <FormRow
        label="재사용 유예"
        htmlFor="refreshTokenGraceSec"
        hint="갱신으로 바뀐 refresh token을 이 시간(초) 안에 다시 쓰면 재사용으로 보지 않고 새 토큰을 줘요. 여러 탭이나 서버가 동시에 갱신해도 로그인이 끊기지 않게 해요. 0이면 끄고, 최대 60초예요."
      >
        <Input
          id="refreshTokenGraceSec"
          name="refreshTokenGraceSec"
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          step={1}
          defaultValue={state?.fields?.refreshTokenGraceSec ?? graceSec}
          className="w-28"
        />
      </FormRow>
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "저장 중" : "토큰 설정 저장"}
        </Button>
      </div>
    </form>
  );
}
