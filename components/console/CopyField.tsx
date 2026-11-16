"use client";

import { useState } from "react";

import { InfoRow, TextAction } from "./ui";

/** 테두리 카드 한 줄 + 복사 (client ID, secret, discovery URL) */
export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <InfoRow
      label={label}
      action={
        <TextAction
          aria-label={`${label} 복사`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "복사됨" : "복사"}
          <span role="status" className="sr-only">
            {copied ? `${label} 복사됨` : ""}
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
