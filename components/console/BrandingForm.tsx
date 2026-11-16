"use client";

import { useActionState, useState } from "react";

import { updateBranding, type ActionState } from "@/actions/services";
import { Button, FormRow, Input, Notice } from "./ui";

interface Props {
  serviceId: string;
  brandColor: string | null;
  brandBackground: string | null;
  logoUrl: string | null;
}

const DEFAULT_BRAND = "#2c73f4";

function ColorInput({ name, label, value, onChange, hint }: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <FormRow label={label} htmlFor={name} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} 고르기`}
          value={valid ? value : DEFAULT_BRAND}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 w-12 shrink-0 cursor-pointer rounded-lg border border-base bg-base-elevated p-1"
        />
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="비우면 기본값"
          className="font-mono"
        />
      </div>
    </FormRow>
  );
}

export function BrandingForm({ serviceId, brandColor, brandBackground, logoUrl }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateBranding.bind(null, serviceId),
    null,
  );
  const [brand, setBrand] = useState(brandColor ?? "");
  const [background, setBackground] = useState(brandBackground ?? "");

  return (
    <form action={action} className="flex flex-col gap-8">
      {state?.error && <Notice tone="negative">{state.error}</Notice>}
      {state?.message && <Notice tone="positive">{state.message}</Notice>}

      <FormRow label="로고" htmlFor="logo" hint="PNG, JPG, GIF, WebP / 권장 128px 정사각형 / 최대 250KB">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="현재 로고" width={56} height={56} className="size-14 object-cover" />
          ) : (
            <span className="flex size-14 items-center justify-center bg-base text-label text-quaternary">
              없음
            </span>
          )}
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="min-w-0 text-footnote text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-base file:px-3 file:py-2 file:text-footnote file:font-strong"
          />
        </div>
        {logoUrl && (
          <label className="flex items-center gap-2 text-footnote text-secondary">
            <input type="checkbox" name="removeLogo" /> 로고 지우기
          </label>
        )}
      </FormRow>

      <ColorInput
        name="brandColor"
        label="브랜드 색"
        value={brand}
        onChange={setBrand}
        hint="배경 그리드와 카드 테두리에 쓰여요."
      />
      <ColorInput
        name="brandBackground"
        label="배경 색"
        value={background}
        onChange={setBackground}
        hint="비우면 브랜드 색을 그대로 써요."
      />

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중" : "저장"}
        </Button>
      </div>
    </form>
  );
}
