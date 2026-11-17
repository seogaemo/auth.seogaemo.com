"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { Provider } from "@/lib/config";
import { LegalLinks } from "@/components/login/LegalLinks";
import { LoginPreview } from "@/components/login/LoginPreview";

/**
 * 로그인 화면 메뉴의 세 폼이 입력하는 값을 저장 전에 미리보기로 모은다.
 * 폼은 바뀔 때마다 update를 부르고, 미리보기는 저장된 값 대신 이 값을 그린다.
 */
export interface LoginDraft {
  name: string;
  providers: Provider[];
  brandColor: string;
  brandBackground: string;
  logoUrl: string | null;
  /** 로고를 새로 고르거나 지웠는데 아직 저장 안 함 */
  logoChanged: boolean;
  termsUrl: string;
  privacyUrl: string;
}

type Saved = Omit<LoginDraft, "logoChanged">;

const Ctx = createContext<{
  draft: LoginDraft;
  saved: Saved;
  update: (patch: Partial<LoginDraft>) => void;
} | null>(null);

/** 미리보기 밖에서 폼을 쓰면 아무 일도 안 한다 */
export function useLoginDraft() {
  return useContext(Ctx)?.update ?? noop;
}
function noop() {}

export function LoginDraftProvider({ saved, children }: { saved: Saved; children: ReactNode }) {
  const [draft, setDraft] = useState<LoginDraft>({
    ...saved,
    logoChanged: false,
  });
  const update = useCallback((patch: Partial<LoginDraft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const value = useMemo(() => ({ draft, saved, update }), [draft, saved, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** 지금 입력한 값으로 그린 로그인 화면. 저장된 값과 다르면 위에 알린다. */
export function LivePreview({ available }: { available: Provider[] }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const { draft, saved } = ctx;
  const providers = draft.providers.filter((p) => available.includes(p));
  const dirty =
    draft.name.trim() !== saved.name ||
    !sameList(draft.providers, saved.providers) ||
    color(draft.brandColor) !== color(saved.brandColor) ||
    color(draft.brandBackground) !== color(saved.brandBackground) ||
    draft.logoChanged ||
    url(draft.termsUrl) !== url(saved.termsUrl) ||
    url(draft.privacyUrl) !== url(saved.privacyUrl);

  return (
    <>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-footnote text-tertiary">미리보기</span>
        <span role="status" className="text-label font-strong text-content-accent">
          {dirty ? "저장 안 한 내용이 있어요" : ""}
        </span>
      </div>
      <LoginPreview
        name={draft.name.trim() || saved.name}
        logoUrl={draft.logoUrl}
        branding={{
          brandColor: draft.brandColor.trim(),
          brandBackground: draft.brandBackground.trim(),
        }}
        providers={providers}
        footer={
          <LegalLinks
            service={{
              termsUrl: urlOrNull(draft.termsUrl),
              privacyUrl: urlOrNull(draft.privacyUrl),
            }}
          />
        }
      />
    </>
  );
}

/** 서버가 저장하는 모양으로 맞춰 비교한다 (lib/console/validation.ts) */
const color = (value: string) => value.trim().toLowerCase();
function url(value: string) {
  try {
    return new URL(value.trim()).toString();
  } catch {
    return value.trim();
  }
}

/** https 주소만 미리보기 링크로 보여준다 (저장할 때도 https만 받는다) */
function urlOrNull(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
