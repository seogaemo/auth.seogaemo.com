"use client";

import Link from "next/link";
import { useActionState } from "react";

import { createService, type ActionState } from "@/actions/services";
import { CopyField } from "./CopyField";
import { Button, FormRow, Input, Notice, Textarea } from "./ui";

export function NewServiceForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createService, null);

  if (state?.secret && state.serviceId && state.clientId) {
    return (
      <div className="flex flex-col gap-6">
        <Notice tone="positive">서비스를 만들었어요.</Notice>
        <CopyField label="Client ID" value={state.clientId} />
        <CopyField label="Client Secret" value={state.secret} secret />
        <p className="rounded-lg bg-warning-elevated px-4 py-3 text-footnote text-primary">
          Client Secret은 지금 한 번만 보여줘요. 안전한 곳에 저장하세요. 잃어버리면 설정에서 새로 발급할 수 있어요.
        </p>
        <div>
          <Link
            href={`/console/services/${state.serviceId}`}
            className="inline-flex h-12 items-center rounded-lg bg-accent px-5 text-body font-strong text-white hover:bg-accent-pressed"
          >
            서비스 설정으로 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form key={JSON.stringify(state?.fields ?? {})} action={action} className="flex flex-col gap-8">
      {state?.error && <Notice tone="negative">{state.error}</Notice>}

      <FormRow label="이름" htmlFor="name" hint="로그인 화면에 &quot;{이름}에 로그인하기&quot;로 보여요.">
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

      <fieldset className="flex flex-col gap-2 sm:flex-row sm:gap-4">
        <legend className="sr-only">앱 종류</legend>
        <span aria-hidden className="shrink-0 pt-3 text-footnote text-quaternary sm:w-28">
          앱 종류
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <label className="flex cursor-pointer gap-3 rounded-lg border border-base p-4 has-[:checked]:border-accent">
            <input type="radio" name="clientType" value="confidential" defaultChecked={state?.fields?.clientType !== "public"} className="mt-1" />
            <span className="flex flex-col gap-1">
              <span className="text-body font-strong text-primary">서버가 있는 웹앱</span>
              <span className="text-footnote text-tertiary">
                서버에서 토큰을 받아요. Client Secret을 발급해요.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-base p-4 has-[:checked]:border-accent">
            <input type="radio" name="clientType" value="public" defaultChecked={state?.fields?.clientType === "public"} className="mt-1" />
            <span className="flex flex-col gap-1">
              <span className="text-body font-strong text-primary">SPA, 모바일 앱</span>
              <span className="text-footnote text-tertiary">
                브라우저나 앱에서 바로 토큰을 받아요. Secret 없이 PKCE만 써요.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "만드는 중" : "서비스 만들기"}
        </Button>
      </div>
    </form>
  );
}
