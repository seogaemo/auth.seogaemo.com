import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DeleteAccountForm, PasswordForm, RemovePasskeyButton, SignOutOthersButton } from "@/components/account/AccountForms";
import { LoginTextLink } from "@/components/login/fields";
import { LoginShell } from "@/components/login/LoginShell";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { getPrisma } from "@/cloudflare";
import { loadAccount } from "@/lib/account";
import { isLoginMethod, LOGIN_METHOD_LABELS } from "@/lib/config";
import { browserAccounts, currentBrowserKey } from "@/lib/oauth/session";
import { listPasskeys, passkeyAvailable } from "@/lib/passkey";
import { describeUserAgent } from "@/lib/request";
import { getProviders, isAllowedPostLogoutUri, serviceHomeUrl } from "@/lib/service";

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
 * client_id 없이 들어왔을 때. 앱마다 계정이 따로라서, 이 브라우저에 로그인돼 있는 앱 중에서 고른다.
 * 하나뿐이면 바로 그 계정으로, 없으면 쓰는 앱에서 들어오라고 안내한다.
 */
async function AccountChooser() {
  const accounts = await browserAccounts(await currentBrowserKey());
  if (accounts.length === 1) redirect(`/account?client_id=${encodeURIComponent(accounts[0].service.clientId)}`);

  return (
    <LoginShell>
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-[24px] font-[450] leading-[1.35] tracking-[-0.04em] text-black">내 계정</h1>
        <p className="text-footnote text-secondary">
          {accounts.length > 0
            ? "Seogaemo 계정은 앱마다 따로예요. 관리할 앱을 고르세요."
            : "이 브라우저에 로그인된 앱이 없어요. 쓰고 있는 앱에서 계정 관리로 들어오거나, 앱에 로그인한 뒤 다시 열어 주세요."}
        </p>
      </div>
      {accounts.length > 0 && (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={a.id}>
              <a
                href={`/account?client_id=${encodeURIComponent(a.service.clientId)}`}
                className="flex items-center gap-3 border-2 border-[rgba(0,0,0,0.12)] px-3 py-2.5 hover:bg-[#f7f7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-[15px] font-[600] tracking-[-0.04em] text-[#101016]">
                    {a.service.isSystem ? "Seogaemo 콘솔" : a.service.name}
                  </span>
                  <span className="text-label text-tertiary [overflow-wrap:anywhere]">{a.user.email ?? a.user.name ?? "이름 없음"}</span>
                </span>
                <span aria-hidden className="font-mono text-[15px] text-[#101016]">
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </LoginShell>
  );
}

/**
 * 일반 사용자의 계정 화면. 앱은 https://auth.seogaemo.com/account?client_id=... 로 연결한다.
 * 이 브라우저에 그 앱 로그인 세션이 없으면 로그인부터 한다. 콘솔 개발자 계정도 같은 화면을 쓴다.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ client_id?: string }> }) {
  const { client_id: clientId } = await searchParams;
  if (!clientId) return <AccountChooser />;
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
  // 콘솔 계정은 소유한 앱이 있으면 탈퇴할 수 없다 (앱이 주인 없이 남는다)
  const ownedApps = service.isSystem ? await prisma.service.count({ where: { ownerId: user.id } }) : 0;
  const displayName = service.isSystem ? "Seogaemo 콘솔" : service.name;

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={service.logoKey ? `/service-logo/${service.id}` : null}
        title={
          <>
            {displayName}
            <br />내 계정
          </>
        }
        description={user.email ?? user.name ?? undefined}
      />

      <div className="flex flex-col gap-6">
        <Section title="로그인 방식">
          {methods.length === 0 && <p className="text-footnote text-secondary">연결된 로그인 방식이 없어요.</p>}
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
                    <span className="min-w-0 text-footnote text-[#101016]">
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
                <span className="min-w-0 text-footnote text-[#101016]">
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
          {/* 콘솔은 콘솔 세션 쿠키도 지워야 해서 콘솔 로그아웃으로 보낸다 */}
          <form action={service.isSystem ? "/console/logout" : "/oauth/logout"} method="post">
            {!service.isSystem && <input type="hidden" name="client_id" value={service.clientId} />}
            {!service.isSystem && home && isAllowedPostLogoutUri(service, home) && (
              <input type="hidden" name="post_logout_redirect_uri" value={home} />
            )}
            <button
              type="submit"
              className="flex h-12 w-full items-center justify-center border-2 border-[rgba(0,0,0,0.12)] bg-white shadow-[0_3px_0_0_rgba(0,0,0,0.12)] transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none motion-reduce:transition-none hover:bg-[#f7f7f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-login-brand focus-visible:ring-offset-2"
            >
              <span className="font-mono text-[15px] font-[600] tracking-[-0.06em] text-[#101016]">이 기기에서 로그아웃</span>
            </button>
          </form>
        </Section>

        <Section title="탈퇴">
          {ownedApps > 0 ? (
            <p className="text-footnote text-secondary">
              소유한 앱이 {ownedApps}개 있어서 지금은 탈퇴할 수 없어요. 콘솔에서 앱을 먼저 지우세요.
            </p>
          ) : (
            <>
              <p className="text-footnote text-secondary">
                {service.isSystem
                  ? "콘솔 계정과 로그인 기록이 지워지고 되돌릴 수 없어요. 관리자로 참여한 앱에서도 빠져요."
                  : `${service.name}의 계정과 로그인 기록이 지워지고 되돌릴 수 없어요. 서비스에 저장된 다른 정보는 서비스에 따로 문의하세요.`}
              </p>
              <DeleteAccountForm clientId={service.clientId} confirmText={user.email ?? "탈퇴"} />
            </>
          )}
        </Section>

        {home && <LoginTextLink href={home}>{displayName} 열기 →</LoginTextLink>}
      </div>
    </LoginShell>
  );
}
