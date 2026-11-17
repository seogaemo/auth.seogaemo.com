import { isSocialProvider, type Provider } from "@/lib/config";
import { LoginDivider } from "./fields";
import { LoginShell, type Branding } from "./LoginShell";
import { ProviderButton, ProviderIconButton } from "./ProviderButton";
import { ServiceHeading } from "./ServiceHeading";

/** 콘솔 Branding의 미리보기. 실제 로그인 화면(app/login/page.tsx)과 같은 모양, 동작은 없다. */
export function LoginPreview({
  name,
  logoUrl,
  branding,
  providers,
}: {
  name: string;
  logoUrl: string | null;
  branding: Branding;
  providers: Provider[];
}) {
  const emailFirst = providers.includes("password") || providers.includes("email");
  const socials = providers.filter(isSocialProvider);

  const fakeInput = (label: string, placeholder: string) => (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[13px] font-[500] tracking-[-0.04em] text-quaternary">{label}</span>
      <span className="flex h-12 items-center border-2 border-[rgba(0,0,0,0.12)] px-3 font-mono text-[15px] text-quaternary">
        {placeholder}
      </span>
    </div>
  );

  return (
    <LoginShell branding={branding} preview>
      <ServiceHeading name={name} logoUrl={logoUrl} />
      <div aria-hidden className="pointer-events-none flex flex-col gap-5">
        {emailFirst && (
          <div className="flex flex-col gap-3">
            {fakeInput("이메일", "name@example.com")}
            <span className="mt-1 flex h-12 items-center justify-center border-2 border-[rgba(0,0,0,0.2)] bg-login-brand shadow-[0_3px_0_0_var(--login-brand-strong)]">
              <span className="font-mono text-[15px] font-[600] tracking-[-0.06em] text-[var(--login-on-brand)]">계속하기</span>
            </span>
          </div>
        )}
        {socials.length > 0 &&
          (emailFirst ? (
            <>
              <LoginDivider />
              <div className="flex justify-center gap-3">
                {socials.map((provider) => (
                  <ProviderIconButton key={provider} provider={provider} preview />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2.5">
              {socials.map((provider) => (
                <ProviderButton key={provider} provider={provider} preview />
              ))}
            </div>
          ))}
        {providers.length === 0 && <p className="text-footnote text-quaternary">켜진 로그인 방식이 없어요.</p>}
      </div>
    </LoginShell>
  );
}
