"use client";

import { useActionState } from "react";

import { updateLoginMethods, type ActionState } from "@/actions/services";
import { PROVIDERS, providerIcon, type Provider } from "@/lib/config";
import { PROVIDER_LABEL } from "./ProviderIcons";
import { Button, Card, CheckMark, FormFeedback, FormRow, Input } from "./ui";

interface Props {
  serviceId: string;
  name: string;
  providers: Provider[];
  /** 서버에 키가 설정된 제공자 */
  available: Provider[];
}

/** 로그인 화면에 보이는 앱 이름과 로그인 버튼(로그인 방식) */
export function LoginMethodsForm({ serviceId, name, providers, available }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateLoginMethods.bind(null, serviceId), null);

  return (
    <div className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />
      <form key={JSON.stringify(state?.fields ?? {})} action={action} className="flex flex-col gap-4">
        <Card>
          <FormRow label="이름" htmlFor="name" hint='로그인 화면에 "{이름}에 로그인하기"로 보여요.'>
            <Input id="name" name="name" required maxLength={40} defaultValue={state?.fields?.name ?? name} />
          </FormRow>

          <fieldset className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
            <legend className="sr-only">로그인 방식</legend>
            <span aria-hidden className="shrink-0 text-footnote text-tertiary sm:w-28 sm:pt-[10px]">
              로그인 방식
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {PROVIDERS.map((provider) => {
                const ready = available.includes(provider);
                return (
                  <label
                    key={provider}
                    className={`flex h-10 items-center gap-2 rounded-lg border-2 border-base px-3 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-elevated has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--content-accent)] ${
                      ready ? "cursor-pointer hover:bg-base" : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="providers"
                      value={provider}
                      defaultChecked={providers.includes(provider)}
                      disabled={!ready}
                      className="peer sr-only"
                    />
                    <CheckMark />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={providerIcon(provider, true)} alt="" width={18} height={18} />
                    <span className="text-footnote font-strong text-primary">{PROVIDER_LABEL[provider]}</span>
                    {!ready && <span className="text-label text-quaternary">준비 중</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
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
