"use client";

import { useState, useTransition } from "react";

import { rotateClientSecret } from "@/actions/services";
import { CopyField } from "./CopyField";
import { InfoRow, Notice, TextAction } from "./ui";

/** Client Secret 행. 원문은 저장하지 않으므로 재발급할 때만 보여준다. */
export function RotateSecret({ serviceId }: { serviceId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (secret) {
    return (
      <>
        <CopyField label="Client Secret" value={secret} secret />
        <Notice tone="warning">지금 한 번만 보여줘요. 이전 Client Secret은 바로 쓸 수 없게 됐어요.</Notice>
      </>
    );
  }

  return (
    <>
      <InfoRow
        label="Client Secret"
        action={
          <TextAction
            arrow
            disabled={pending}
            onClick={() => {
              if (!confirm("새 Client Secret을 발급할까요? 지금 Client Secret은 바로 쓸 수 없게 돼요.")) return;
              startTransition(async () => {
                const result = await rotateClientSecret(serviceId);
                if (result?.secret) setSecret(result.secret);
                else setError(result?.error ?? "발급하지 못했어요.");
              });
            }}
          >
            {pending ? "발급 중" : "새로 발급하기"}
          </TextAction>
        }
      >
        <span className="font-mono text-footnote text-quaternary">sgs_••••••••••••</span>
      </InfoRow>
      <div role="alert">{error && <Notice tone="negative">{error}</Notice>}</div>
    </>
  );
}
