"use client";

import { useState } from "react";

import { Button } from "./ui";

/**
 * "AI에게 맡기기": 이 앱의 실제 값과 아직 안 된 설정을 담은 안내를 복사한다.
 * Claude Code, Cursor 같은 도구에 그대로 붙여 넣으면 된다.
 */
export function AiPrompt({ prompt, todoCount }: { prompt: string; todoCount: number }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-base bg-base-elevated p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-footnote text-secondary">
          이 앱의 Client ID, 등록된 주소, 서명 방식과 연결 규칙을 담은 안내예요. Claude Code, Cursor 같은 AI 도구에 붙여 넣으면 프레임워크에
          맞게 붙여 줘요.
          {todoCount > 0 && ` 아직 안 끝난 설정 ${todoCount}개도 AI가 어디서 무엇을 하면 되는지 알려 줘요.`} Client Secret은 들어 있지 않아요.
        </p>
        <Button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "복사했어요" : "AI용 안내 복사"}
        </Button>
        <span role="status" className="sr-only">
          {copied ? "AI용 안내를 복사했어요" : ""}
        </span>
      </div>
      <details className="group">
        <summary className="cursor-pointer text-label font-strong text-content-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)]">
          안내 내용 보기
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-base bg-base p-4 font-mono text-[12px] leading-[1.6] text-primary">
          {prompt}
        </pre>
      </details>
    </div>
  );
}
