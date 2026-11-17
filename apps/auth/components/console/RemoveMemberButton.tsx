"use client";

import { useState, useTransition } from "react";

import { removeMember } from "@/actions/members";

/** 관리자 빼기. 자기 자신이면 "나가기"가 되고, 끝나면 서비스 목록으로 간다. */
export function RemoveMemberButton({
  serviceId,
  memberId,
  email,
  self,
}: {
  serviceId: string;
  memberId: string;
  email: string;
  self: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = self ? "나가기" : "빼기";
  const question = self
    ? "이 앱의 관리자에서 나갈까요? 다시 들어오려면 소유자가 추가해야 해요."
    : `관리자에서 뺄까요? ${email}\n이 앱을 더 관리할 수 없게 돼요.`;

  return (
    <span className="flex shrink-0 items-center gap-2">
      <span role="alert" className="text-label text-content-negative">
        {error}
      </span>
      <button
        type="button"
        aria-label={`${label} ${email}`}
        disabled={pending}
        onClick={() => {
          if (!confirm(question)) return;
          startTransition(async () => {
            setError(null);
            const result = await removeMember(serviceId, memberId);
            if (result?.redirectTo) window.location.assign(result.redirectTo);
            else if (result?.error) setError(result.error);
          });
        }}
        className="shrink-0 whitespace-nowrap rounded text-footnote text-content-negative hover:underline disabled:opacity-50"
      >
        {pending ? "처리 중" : label}
      </button>
    </span>
  );
}
