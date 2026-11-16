"use client";

import { useActionState } from "react";

import { updateSettings, type ActionState } from "@/actions/services";
import type { Provider } from "@/lib/config";
import { PROVIDER_LABEL } from "./ProviderIcons";
import { Button, FormRow, Input, Notice, Textarea } from "./ui";

interface Props {
  serviceId: string;
  name: string;
  redirectUris: string[];
  providers: Provider[];
  /** 서버에 키가 설정된 제공자 */
  available: Provider[];
}

export function SettingsForm({ serviceId, name, redirectUris, providers, available }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateSettings.bind(null, serviceId),
    null,
  );

  return (
    <form key={JSON.stringify(state?.fields ?? {})} action={action} className="flex flex-col gap-8">
      {state?.error && <Notice tone="negative">{state.error}</Notice>}
      {state?.message && <Notice tone="positive">{state.message}</Notice>}

      <FormRow label="이름" htmlFor="name">
        <Input id="name" name="name" required maxLength={40} defaultValue={state?.fields?.name ?? name} />
      </FormRow>

      <FormRow
        label="Redirect URI"
        htmlFor="redirectUris"
        hint="한 줄에 하나씩. 요청한 redirect_uri가 여기 있는 값과 글자 하나까지 같아야 해요."
      >
        <Textarea
          id="redirectUris"
          name="redirectUris"
          rows={Math.max(3, redirectUris.length + 1)}
          defaultValue={state?.fields?.redirectUris ?? redirectUris.join("\n")}
          placeholder="https://example.com/auth/callback"
        />
      </FormRow>

      <fieldset className="flex flex-col gap-2 sm:flex-row sm:gap-4">
        <legend className="sr-only">인증 방식</legend>
        <span aria-hidden className="shrink-0 pt-3 text-footnote text-quaternary sm:w-28">
          인증 방식
        </span>
        <div className="flex flex-1 flex-col gap-2 pt-3">
          {(["google", "kakao"] as const).map((provider) => (
            <label key={provider} className="flex items-center gap-3">
              <input
                type="checkbox"
                name="providers"
                value={provider}
                defaultChecked={providers.includes(provider)}
                disabled={!available.includes(provider)}
                className="size-4"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/brand/${provider}.svg`} alt="" width={20} height={20} />
              <span className="text-body text-primary">{PROVIDER_LABEL[provider]}</span>
              {!available.includes(provider) && (
                <span className="text-label text-quaternary">준비 중</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중" : "저장"}
        </Button>
      </div>
    </form>
  );
}
