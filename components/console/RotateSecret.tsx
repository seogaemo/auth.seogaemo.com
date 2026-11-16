"use client";

import { useState, useTransition } from "react";

import { rotateClientSecret } from "@/actions/services";
import { CopyField } from "./CopyField";
import { Button, Notice } from "./ui";

export function RotateSecret({ serviceId }: { serviceId: string }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (secret) {
    return (
      <div className="flex flex-col gap-2">
        <CopyField label="새 Client Secret" value={secret} secret />
        <p className="rounded-lg bg-warning-elevated px-4 py-3 text-footnote text-primary">
          지금 한 번만 보여줘요. 이전 secret은 바로 쓸 수 없게 됐어요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <Notice tone="negative">{error}</Notice>}
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (!confirm("새 secret을 발급하면 지금 secret은 바로 쓸 수 없게 돼요. 계속할까요?")) return;
            startTransition(async () => {
              const result = await rotateClientSecret(serviceId);
              if (result?.secret) setSecret(result.secret);
              else setError(result?.error ?? "발급하지 못했어요.");
            });
          }}
        >
          Client Secret 새로 발급
        </Button>
      </div>
    </div>
  );
}
