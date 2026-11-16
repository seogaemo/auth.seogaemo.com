import { PROVIDER_LABELS as LABEL, PROVIDERS, type Provider } from "@/lib/config";

/** 인증 방식 상태 (DESIGN.md 5.3). 켜짐은 브랜드 색, 꺼짐은 회색. 상태는 aria-label로도 알린다. */
export function ProviderIcons({ enabled, size = 20 }: { enabled: Provider[]; size?: 20 | 24 }) {
  return (
    <ul className="flex shrink-0 items-center gap-2.5">
      {PROVIDERS.map((provider) => {
        const on = enabled.includes(provider);
        return (
          <li key={provider} aria-label={`${LABEL[provider]} ${on ? "사용 중" : "꺼짐"}`} className="flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/icons/${provider}-${on ? "on" : "off"}.svg`} alt="" width={size} height={size} />
          </li>
        );
      })}
    </ul>
  );
}

export { LABEL as PROVIDER_LABEL };
