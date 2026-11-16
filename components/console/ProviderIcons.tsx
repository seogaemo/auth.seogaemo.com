import { PROVIDERS, type Provider } from "@/lib/config";

const LABEL: Record<Provider, string> = { google: "Google", kakao: "카카오" };

/** 인증 수단 상태 표시 (DESIGN.md 5.3). 꺼진 것은 흐리게, 상태는 aria-label로도 알린다. */
export function ProviderIcons({ enabled, size = 20 }: { enabled: Provider[]; size?: number }) {
  return (
    <ul className="flex items-center gap-2.5">
      {PROVIDERS.map((provider) => {
        const on = enabled.includes(provider);
        return (
          <li key={provider} aria-label={`${LABEL[provider]} ${on ? "사용 중" : "꺼짐"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/brand/${provider}.svg`}
              alt=""
              width={size}
              height={size}
              className={on ? "" : "opacity-25 grayscale"}
            />
          </li>
        );
      })}
    </ul>
  );
}

export { LABEL as PROVIDER_LABEL };
