"use client";

import { useActionState } from "react";

import { addMember } from "@/actions/members";
import type { ActionState } from "@/actions/services";
import { Button, Card, FormFeedback, FormRow, Input } from "./ui";

export function AddMemberForm({ serviceId }: { serviceId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMember.bind(null, serviceId), null);

  return (
    <div className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />
      {/* 성공하면 key가 바뀌어 입력칸이 비워진다 */}
      <form key={state?.message ?? "form"} action={action}>
        <Card>
          <FormRow
            label="이메일"
            htmlFor="member-email"
            hint="이 이메일로 콘솔에 로그인하면 이 서비스를 같이 관리할 수 있어요. 아직 가입 전이어도 돼요."
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="member-email"
                name="email"
                type="email"
                autoComplete="off"
                required
                placeholder="name@example.com"
                defaultValue={state?.fields?.email}
              />
              <Button type="submit" disabled={pending}>
                {pending ? "추가하는 중" : "관리자 추가"}
              </Button>
            </div>
          </FormRow>
        </Card>
      </form>
    </div>
  );
}
