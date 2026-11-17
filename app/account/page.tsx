import type { Metadata } from "next";

import { DeleteAccountForm, PasswordForm, RemovePasskeyButton, SignOutOthersButton } from "@/components/account/AccountForms";
import { LoginTextLink } from "@/components/login/fields";
import { LoginShell } from "@/components/login/LoginShell";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { getPrisma } from "@/cloudflare";
import { loadAccount } from "@/lib/account";
import { isLoginMethod, LOGIN_METHOD_LABELS } from "@/lib/config";
import { listPasskeys, passkeyAvailable } from "@/lib/passkey";
import { describeUserAgent } from "@/lib/request";
import { getProviders, serviceHomeUrl } from "@/lib/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "내 계정" };

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t-2 border-[rgba(0,0,0,0.08)] pt-5">
      <h2 className="font-mono text-[15px] font-[600] tracking-[-0.04em] text-black">{title}</h2>
      {children}
    </section>
  );
}

/**
 * 일반 사용자의 계정 화면. 서비스는 https://auth.seogaemo.com/account?client_id=... 로 연결한다.
 * 이 브라우저에 그 서비스 로그인 세션이 없으면 로그인부터 한다.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
  const { client_id: clientId } = await searchParams;
  const { service, session, user } = await loadAccount(clientId);
  const prisma = getPrisma();

  const [identities, sessions, passkeys] = await Promise.all([
    prisma.identity.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    }),
    listPasskeys(user.email),
  ]);
  const hasPassword = identities.some((i) => i.provider === "password" && i.passwordHash);
  const canUsePassword = hasPassword || (getProviders(service).includes("password") && !!user.email);
  const home = serviceHomeUrl(service);
  const methods = [...new Set(identities.map((i) => i.provider))].filter(isLoginMethod);

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={service.logoKey ? `/service-logo/${service.id}` : null}
        title={
          <>
            {service.name}
            <br />내 계정
          </>
        }
        description={user.email ?? user.name ?? undefined}
      />

      <div className="flex flex-col gap-6">
        <Section title="로그인 방식">
          <ul className="flex flex-wrap gap-2">
            {methods.map((method) => (
              <li key={method} className="border-2 border-[rgba(0,0,0,0.12)] px-2.5 py-1 font-mono text-[13px] tracking-[-0.04em] text-[#101016]">
                {LOGIN_METHOD_LABELS[method]}
              </li>
            ))}
          </ul>
          <p className="text-label text-tertiary">가입한 날 {dateTime.format(user.createdAt)}</p>
        </Section>

        {canUsePassword && (
          <Section title="비밀번호">
            {!hasPassword && (
              <p className="text-footnote text-secondary">비밀번호를 만들면 이메일과 비밀번호로도 로그인할 수 있어요.</p>
            )}
            <PasswordForm clientId={service.clientId} hasPassword={hasPassword} />
          </Section>
        )}

        {user.email && (passkeys.length > 0 || passkeyAvailable(getProviders(service))) && (
          <Section title="패스키">
            <p className="text-footnote text-secondary">
              패스키는 {user.email}에 붙어 있어요. 삭제하면 모든 Seogaemo 서비스에 적용돼요. 새 패스키는 이메일 코드나 비밀번호로 로그인할 때 저장할 수 있어요.
            </p>
            {passkeys.length === 0 ? (
              <p className="text-footnote text-tertiary">저장한 패스키가 없어요.</p>
            ) : (
              <ul className="flex flex-col">
                {passkeys.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] py-2 last:border-0">
                    <span className="text-footnote text-[#101016]">
                      {dateTime.format(p.createdAt)} 저장
                      <span className="ml-1.5 text-label text-tertiary">
                        {p.lastUsedAt ? `마지막 사용 ${dateTime.format(p.lastUsedAt)}` : "사용한 적 없음"}
                      </span>
                    </span>
                    <RemovePasskeyButton clientId={service.clientId} passkeyId={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="로그인된 기기">
          <ul className="flex flex-col">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] py-2 last:border-0">
                <span className="text-footnote text-[#101016]">
                  {describeUserAgent(s.userAgent)}
                  {s.id === session.id && <span className="ml-1.5 text-label text-[var(--login-brand-text)]">이 기기</span>}
                </span>
                <span className="shrink-0 text-label text-tertiary">{dateTime.format(s.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
          {sessions.length > 1 && <SignOutOthersButton clientId={service.clientId} />}
        </Section>

        <Section title="로그아웃">
          <form action="/oauth/logout" method="post">
            <input type="hidden" name="client_id" value={service.clientId} />
            {home && <input type="hidden" name="post_logout_redirect_uri" value={home} />}
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center border-2 border-[rgba(0,0,0,0.12)] bg-white shadow-[0_3px_0_0_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none motion-reduce:transition-none hover:bg-[#f7f7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2"
            >
              <span className="font-mono text-[15px] font-[600] tracking-[-0.06em] text-[#101016]">이 기기에서 로그아웃</span>
            </button>
          </form>
        </Section>

        <Section title="탈퇴">
          <p className="text-footnote text-secondary">
            {service.name}의 계정과 로그인 기록이 지워지고 되돌릴 수 없어요. 서비스에 저장된 다른 정보는 서비스에 따로 문의하세요.
          </p>
          <DeleteAccountForm clientId={service.clientId} confirmText={user.email ?? "탈퇴"} />
        </Section>

        {home && <LoginTextLink href={home}>{service.name} 열기 →</LoginTextLink>}
      </div>
    </LoginShell>
  );
}
