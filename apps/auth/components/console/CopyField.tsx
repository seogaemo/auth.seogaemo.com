"use client";

import { InfoRow, TextAction } from "./ui";
import { copyStatus, useCopy } from "./useCopy";

/** 테두리 카드 한 줄 + 복사 (client ID, secret, discovery URL) */
export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, copy] = useCopy();

  return (
    <InfoRow
      label={label}
      action={
        <TextAction
          aria-label={`${label} 복사`}
          onClick={() => copy(value)}
        >
          {copied === "copied" ? "복사됨" : copied === "failed" ? "복사 실패" : "복사"}
          <span role="status" className="sr-only">
            {copyStatus(copied, label)}
          </span>
        </TextAction>
      }
    >
      <code
        className={`block break-all font-mono text-footnote text-primary ${
          secret ? "rounded bg-warning-elevated px-1.5 py-0.5" : ""
        }`}
      >
        {value}
      </code>
    </InfoRow>
  );
}
