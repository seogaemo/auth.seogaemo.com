"use client";

import { useActionState, useState } from "react";

import { updateAllowlist, type ActionState } from "@/actions/services";
import { Button, Card, FormFeedback, FormRow, Textarea } from "./ui";

interface Props {
  serviceId: string;
  restrictLogin: boolean;
  allowedEmails: string[];
}

/** 켜고 끄는 스위치. 체크박스에 role="switch"를 줘서 스크린 리더가 "켬/끔"으로 읽는다. */
function Switch({
  id,
  name,
  defaultChecked,
  onChange,
  describedBy,
}: {
  id: string;
  name: string;
  defaultChecked: boolean;
  onChange: (checked: boolean) => void;
  describedBy?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        defaultChecked={defaultChecked}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="h-7 w-12 rounded-full bg-[var(--border-base)] transition-colors peer-checked:bg-[#2c73f4] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--content-accent)] peer-focus-visible:ring-offset-2 motion-reduce:transition-none"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform peer-checked:translate-x-5 motion-reduce:transition-none"
      />
    </span>
  );
}

export function AllowlistForm({
  serviceId,
  restrictLogin,
  allowedEmails,
}: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateAllowlist.bind(null, serviceId),
    null,
  );
  const initial = state?.fields
    ? state.fields.restrictLogin === "on"
    : restrictLogin;

  return (
    <div className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />
      {/* 저장할 때마다 새로 그려서 저장된 값(성공) 또는 입력한 값(오류)을 기본값으로 다시 잡는다 */}
      <Fields
        key={JSON.stringify(state ?? {})}
        {...{ action, pending, initial, allowedEmails, state }}
      />
    </div>
  );
}

function Fields({
  action,
  pending,
  initial,
  allowedEmails,
  state,
}: {
  action: (form: FormData) => void;
  pending: boolean;
  initial: boolean;
  allowedEmails: string[];
  state: ActionState;
}) {
  // 스위치 옆 문구용. 체크박스는 비제어로 두고(React 19는 제출 뒤 폼을 reset한다) 바뀔 때 따라간다.
  const [enabled, setEnabled] = useState(initial);

  return (
    <form
      action={action}
      onReset={(e) => {
        const box = e.currentTarget.elements.namedItem(
          "restrictLogin",
        ) as HTMLInputElement | null;
        setTimeout(() => box && setEnabled(box.checked));
      }}
      className="flex flex-col gap-4"
    >
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <label
              htmlFor="restrictLogin"
              className="cursor-pointer text-body font-strong text-primary"
            >
              허용된 이메일 또는 도메인만 로그인하기
            </label>
            <p id="restrictLogin-hint" className="text-footnote text-tertiary">
              {enabled
                ? "켜짐: 아래 목록에 맞는 이메일만 로그인할 수 있어요."
                : "꺼짐: 누구나 로그인하고 가입할 수 있어요."}
            </p>
          </div>
          <Switch
            id="restrictLogin"
            name="restrictLogin"
            defaultChecked={initial}
            onChange={setEnabled}
            describedBy="restrictLogin-hint"
          />
        </div>

        <FormRow
          label="허용 목록"
          htmlFor="allowedEmails"
          hint={
            <>
              한 줄에 하나씩. 이메일(name@example.com)은 그 주소만,
              도메인(example.com)은 그 도메인의 모든 이메일을 허용해요. 하위
              도메인(team.example.com)은 따로 넣으세요. 최대 500개.
            </>
          }
        >
          <Textarea
            id="allowedEmails"
            name="allowedEmails"
            rows={Math.min(12, Math.max(4, allowedEmails.length + 1))}
            defaultValue={
              state?.fields?.allowedEmails ?? allowedEmails.join("\n")
            }
            placeholder={"example.com\nname@gmail.com"}
            spellCheck={false}
            autoCapitalize="off"
          />
        </FormRow>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중" : "저장"}
        </Button>
      </div>
    </form>
  );
}
