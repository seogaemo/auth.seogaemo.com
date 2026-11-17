"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
let loading: Promise<void> | null = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve) => {
    window.onTurnstileLoad = () => resolve();
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile (사람 확인). 폼 안에 두면 cf-turnstile-response 숨은 칸을 채운다.
 * 토큰은 한 번만 쓸 수 있어서, 제출할 때마다 새로 그리도록 부모가 key를 바꿔 준다.
 */
export function Turnstile({ siteKey }: { siteKey: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: siteKey, language: "ko", size: "flexible" });
    });
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey]);

  return <div ref={box} className="min-h-[65px]" />;
}
