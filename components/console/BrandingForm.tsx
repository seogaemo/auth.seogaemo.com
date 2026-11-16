"use client";

import { useActionState, useRef, useState } from "react";

import { updateBranding, type ActionState } from "@/actions/services";
import { Button, Card, FormFeedback, FormRow, Input } from "./ui";

interface Props {
  serviceId: string;
  brandColor: string | null;
  brandBackground: string | null;
  logoUrl: string | null;
}

const DEFAULT_BRAND = "#2c73f4";
const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorInput({
  name,
  label,
  value,
  fallback,
  onChange,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  return (
    <FormRow label={label} htmlFor={name} hint={hint}>
      <div className="flex items-center gap-2">
        <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-base has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--content-accent)] has-[:focus-visible]:ring-offset-2">
          <span className="absolute inset-1 rounded" style={{ background: HEX.test(value) ? value : fallback }} />
          <input
            type="color"
            aria-label={`${label} 고르기`}
            value={HEX.test(value) ? value : fallback}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallback}
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
  const [picked, setPicked] = useState<{ name: string; url: string } | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const shownLogo = removeLogo ? null : (picked?.url ?? logoUrl);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormFeedback error={state?.error} message={state?.message} />

      <Card>
        {/* Page 1 프로필: 56px 이미지 + "사진 변경하기 >" + 안내 */}
        <FormRow label="로고">
          <div className="flex gap-2">
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="로고" width={48} height={48} className="size-12 shrink-0 rounded-md object-cover" />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-base text-label text-quaternary">
                없음
              </span>
            )}
            <div className="flex min-w-0 flex-col justify-between py-0.5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1 text-label font-strong text-content-accent hover:underline"
                >
                  사진 변경하기
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/arrow_forward.svg" alt="" width={16} height={16} />
                </button>
                {(logoUrl || picked) && !removeLogo && (
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveLogo(true);
                      setPicked(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    className="text-label font-strong text-content-negative hover:underline"
                  >
                    지우기
                  </button>
                )}
              </div>
              <p className="text-label text-quaternary">
                {picked ? picked.name : "JPG, GIF, PNG, WebP / 권장 128px, 최대 250KB"}
              </p>
            </div>
          </div>
          <input
            ref={fileRef}
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRemoveLogo(false);
              setPicked({ name: file.name, url: URL.createObjectURL(file) });
            }}
          />
          {removeLogo && <input type="hidden" name="removeLogo" value="on" />}
        </FormRow>

        <ColorInput
          name="brandColor"
          label="브랜드 색"
          value={brand}
          fallback={DEFAULT_BRAND}
          onChange={setBrand}
          hint="배경 그리드와 카드 테두리에 쓰여요."
        />
        <ColorInput
          name="brandBackground"
          label="배경 색"
          value={background}
          fallback={HEX.test(brand) ? brand : DEFAULT_BRAND}
          onChange={setBackground}
          hint="비우면 브랜드 색을 그대로 써요."
        />
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중" : "저장"}
        </Button>
      </div>
    </form>
  );
}
