"use client";

import { useState } from "react";

/** 읽기 전용 값 + 복사 버튼 (client ID, client secret) */
export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-footnote text-quaternary">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className={`min-w-0 flex-1 break-all rounded-lg border border-base px-3 py-3 font-mono text-footnote ${
            secret ? "bg-warning-elevated text-primary" : "bg-base text-primary"
          }`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="h-12 shrink-0 rounded-lg bg-base px-4 text-footnote font-strong text-primary hover:bg-base-pressed"
        >
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  );
}
