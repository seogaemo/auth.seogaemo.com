import { isSocialProvider, type Provider } from "@/lib/config";
import { LoginDivider } from "./fields";
import { LoginShell, type Branding } from "./LoginShell";
import { ProviderButton } from "./ProviderButton";
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
  const password = providers.includes("password");
  const emailCode = providers.includes("email");
  const socials = providers.filter(isSocialProvider);
  const hasOthers = emailCode || socials.length > 0;

  const fakeInput = (label: string, placeholder: string) => (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[13px] font-[500] tracking-[-0.04em] text-quaternary">{label}</span>
      <span className="flex h-12 items-center border-2 border-[rgba(0,0,0,0.12)] px-3 font-mono text-[15px] text-unselected">
        {placeholder}
      </span>
    </div>
  );

  return (
    <LoginShell branding={branding} preview>
      <ServiceHeading name={name} logoUrl={logoUrl} />
      <div aria-hidden className="pointer-events-none flex flex-col gap-5">
        {password && (
          <div className="flex flex-col gap-3">
            {fakeInput("이메일", "name@example.com")}
            {fakeInput("비밀번호", "")}
            <span className="mt-1 flex h-12 items-center justify-center border-2 border-[rgba(0,0,0,0.2)] bg-login-brand shadow-[0_3px_0_0_var(--login-brand-strong)]">
              <span className="font-mono text-[15px] font-[600] tracking-[-0.06em] text-white">로그인</span>
            </span>
          </div>
        )}
        {password && hasOthers && <LoginDivider />}
        {hasOthers && (
          <div className="flex flex-col gap-2.5">
            {emailCode && (
              <span className="flex h-12 items-center justify-center gap-2 border-2 border-[rgba(0,0,0,0.12)] bg-white shadow-[0_3px_0_0_rgba(0,0,0,0.12)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/mail.svg" alt="" width={20} height={20} />
                <span className="font-mono text-[15px] font-[500] tracking-[-0.06em] text-[#101016]">이메일 코드로 로그인</span>
              </span>
            )}
            {socials.map((provider) => (
              <ProviderButton key={provider} provider={provider} preview />
            ))}
          </div>
        )}
        {providers.length === 0 && <p className="text-footnote text-quaternary">켜진 인증 방식이 없어요.</p>}
      </div>
    </LoginShell>
  );
}
