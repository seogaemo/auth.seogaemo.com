import { PROVIDER_LABELS as LABEL, PROVIDERS, type Provider } from "@/lib/config";

/**
 * 인증 방식 상태 (DESIGN.md 5.3). 켜짐은 브랜드 색, 꺼짐은 회색에 사선을 그어
 * 색을 못 구분해도 알 수 있게 한다. 스크린 리더에는 숨은 글자로 읽힌다.
 */
export function ProviderIcons({ enabled, size = 20 }: { enabled: Provider[]; size?: 20 | 24 }) {
  return (
    <ul className="flex shrink-0 items-center gap-2.5">
      {PROVIDERS.map((provider) => {
        const on = enabled.includes(provider);
        return (
          <li key={provider} className="relative flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/icons/${provider}-${on ? "on" : "off"}.svg`} alt="" width={size} height={size} />
            {!on && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-[130%] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-[#777783] ring-1 ring-white"
              />
            )}
            <span className="sr-only">{`${LABEL[provider]} ${on ? "사용 중" : "꺼짐"}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

export { LABEL as PROVIDER_LABEL };
