"use client";

import { useState } from "react";

import { TextAction } from "./ui";

/** 복사 버튼이 달린 코드 블록 (연동 가이드) */
export function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-base bg-base-elevated">
      <div className="flex items-center justify-between gap-3 border-b border-base px-4 py-2">
        <span className="font-mono text-label text-secondary">{title}</span>
        <TextAction
          aria-label={`${title} 복사`}
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "복사됨" : "복사"}
          <span role="status" className="sr-only">
            {copied ? `${title} 복사됨` : ""}
          </span>
        </TextAction>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-[1.6]">
        <code className="font-mono text-primary">{code}</code>
      </pre>
    </div>
  );
}
