"use client";

import { useActionState, useEffect } from "react";

import { createService, type ActionState } from "@/actions/services";
import { CopyField } from "./CopyField";
import { Block, Button, ButtonLink, Card, CheckMark, FormFeedback, FormRow, Input, Notice, Textarea } from "./ui";

const CLIENT_TYPES = [
  {
    value: "confidential",
    title: "서버가 있는 웹앱",
    description: "서버에서 토큰을 받아요. Client Secret을 발급해요.",
  },
  {
    value: "public",
    title: "SPA, 모바일 앱",
    description: "브라우저나 앱에서 바로 토큰을 받아요. Client Secret 없이 PKCE만 써요.",
  },
] as const;

export function NewServiceForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createService, null);
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);

  if (state?.secret && state.serviceId && state.clientId) {
    return (
      <div className="flex flex-col gap-6">
        <Notice tone="positive">앱을 만들었어요.</Notice>
        <Block title="연동 정보">
          <CopyField label="Client ID" value={state.clientId} />
          <CopyField label="Client Secret" value={state.secret} secret />
          <Notice tone="warning">
            Client Secret은 지금 한 번만 보여줘요. 안전한 곳에 저장하세요. 잃어버리면 설정에서 새로 발급할 수 있어요.
          </Notice>
        </Block>
        <div>
          <ButtonLink href={`/console/services/${state.serviceId}?created=1`}>연동하러 가기</ButtonLink>
        </div>
      </div>
    );
  }

  const selectedType = state?.fields?.clientType ?? "confidential";

  return (
    <div className="flex flex-col gap-4">
      <FormFeedback error={state?.error} />
      <form key={JSON.stringify(state?.fields ?? {})} action={action} className="flex flex-col gap-4">
        <Card>
          <FormRow label="이름" htmlFor="name" hint='로그인 화면에 "{이름}에 로그인하기"로 보여요.'>
            <Input
              id="name"
              name="name"
              required
              maxLength={40}
              placeholder="예: SeoulMetro"
              defaultValue={state?.fields?.name}
            />
          </FormRow>

          <FormRow
            label="Redirect URI"
            htmlFor="redirectUris"
            hint="로그인이 끝나면 돌아갈 주소. 한 줄에 하나씩, 나중에 바꿀 수 있어요."
          >
            <Textarea
              id="redirectUris"
              name="redirectUris"
              rows={3}
              placeholder="https://example.com/auth/callback"
              defaultValue={state?.fields?.redirectUris}
            />
          </FormRow>

          <fieldset className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
            <legend className="sr-only">앱 종류</legend>
            <span aria-hidden className="shrink-0 text-footnote text-tertiary sm:w-28 sm:pt-[10px]">
              앱 종류
            </span>
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              {CLIENT_TYPES.map((type) => (
                <label
                  key={type.value}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-lg border-2 border-base px-3 py-2.5 transition-colors hover:bg-base has-[:checked]:border-accent has-[:checked]:bg-accent-elevated has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--content-accent)]"
                >
                  <input
                    type="radio"
                    name="clientType"
                    value={type.value}
                    defaultChecked={selectedType === type.value}
                    className="peer sr-only"
                  />
                  <span className="flex items-center gap-1.5">
                    <CheckMark />
                    <span className="text-footnote font-strong text-primary">{type.title}</span>
                  </span>
                  <span className="text-label text-tertiary">{type.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "만드는 중" : "앱 만들기"}
          </Button>
        </div>
      </form>
    </div>
  );
}
