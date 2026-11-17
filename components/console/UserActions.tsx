"use client";

import { useEffect, useState, useTransition } from "react";

import {
  deleteServiceUserFromDetail,
  revokeUserSessions,
  setUserDisabled,
  type ActionState,
} from "@/actions/services";
import { Button, FormFeedback } from "./ui";

/** 사용자 상세의 정지, 세션 끊기, 삭제. 되돌리기 어려운 것은 한 번 더 묻는다. */
export function UserActions({
  serviceId,
  userId,
  label,
  disabled,
}: {
  serviceId: string;
  userId: string;
  label: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (state?.redirectTo) window.location.assign(state.redirectTo);
  }, [state]);

  const run = (fn: () => Promise<ActionState>, question?: string) => {
    if (question && !confirm(question)) return;
    start(async () => setState(await fn()));
  };

  return (
    <div className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(
              () => revokeUserSessions(serviceId, userId),
              `모든 기기에서 로그아웃시킬까요? ${label}\n앱이 가진 refresh token도 끊겨서 다시 로그인해야 해요.`,
            )
          }
        >
          모든 기기 로그아웃
        </Button>
        {disabled ? (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setUserDisabled(serviceId, userId, false))}>
            정지 풀기
          </Button>
        ) : (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(
                () => setUserDisabled(serviceId, userId, true),
                `정지할까요? ${label}\n로그인, 토큰 갱신이 막히고 지금 로그인도 모두 끊겨요. 나중에 풀 수 있어요.`,
              )
            }
          >
            정지
          </Button>
        )}
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            run(
              () => deleteServiceUserFromDetail(serviceId, userId),
              `사용자를 지울까요? ${label}\n로그인 방식, 토큰, 세션이 같이 지워지고 되돌릴 수 없어요.`,
            )
          }
        >
          사용자 삭제
        </Button>
      </div>
    </div>
  );
}
