"use client";

import { useActionState, useEffect } from "react";

import { deleteService, type ActionState } from "@/actions/services";
import { Button, Card, FormFeedback, FormRow, Input } from "./ui";

export function DeleteServiceForm({ serviceId, name }: { serviceId: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    deleteService.bind(null, serviceId),
    null,
  );
  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormFeedback error={state?.error} />
      <Card tone="danger">
        <FormRow label="확인" htmlFor="confirm" hint={`지우려면 Application 이름을 그대로 입력하세요: ${name}`}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input id="confirm" name="confirm" autoComplete="off" required placeholder={name} />
            <Button type="submit" variant="danger" disabled={pending || Boolean(state?.redirectTo)}>
              삭제
            </Button>
          </div>
        </FormRow>
      </Card>
    </form>
  );
}
