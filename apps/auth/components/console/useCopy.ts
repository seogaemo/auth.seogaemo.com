"use client";

import { useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/**
 * 클립보드 복사. 창에 포커스가 없거나(개발자 도구를 누르고 있을 때) 권한이 막히면 writeText가 거절되므로
 * 그때는 "failed"로 알려 준다. 처리하지 않으면 잡히지 않은 오류로 콘솔에 남는다.
 */
export function useCopy(resetMs = 1500) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function copy(text: string) {
    clearTimeout(timer.current);
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    setState(next);
    // 실패 안내는 읽을 시간이 더 필요하다
    timer.current = setTimeout(() => setState("idle"), next === "failed" ? resetMs * 2 : resetMs);
  }

  return [state, copy] as const;
}

/** 스크린 리더에 읽어 줄 결과 문장 */
export function copyStatus(state: CopyState, what: string) {
  if (state === "copied") return `${what} 복사됨`;
  if (state === "failed") return `${what} 복사 실패. 페이지를 한 번 누른 뒤 다시 시도하세요.`;
  return "";
}
