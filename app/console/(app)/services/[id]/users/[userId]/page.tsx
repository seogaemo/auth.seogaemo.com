import { notFound } from "next/navigation";

import { ServiceHeader } from "@/components/console/ServiceHeader";
import { UserActions } from "@/components/console/UserActions";
import { BackLink, Block, InfoRow, Page } from "@/components/console/ui";
import { getPrisma } from "@/cloudflare";
import { isLoginMethod, LOGIN_METHOD_LABELS } from "@/lib/config";
import { listPasskeys } from "@/lib/passkey";
import { requireServiceAccess } from "@/lib/console/session";
import { describeUserAgent } from "@/lib/request";

export const metadata = { title: "사용자 상세" };

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

const EVENT_LABEL: Record<string, string> = { login: "로그인", signup: "가입", failure: "실패" };
const METHOD_LABEL: Record<string, string> = { ...LOGIN_METHOD_LABELS, session: "로그인 유지" };
const REASON_LABEL: Record<string, string> = {
  wrong_password: "비밀번호 틀림",
  locked: "잠김",
  wrong_code: "코드 틀림",
  disabled: "정지된 계정",
  rate_limited: "요청 과다",
  signup_closed: "가입 막힘",
  wrong_passkey: "패스키 확인 실패",
  unknown_passkey: "서버에 없는 패스키",
};

export default async function UserDetailPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const { service } = await requireServiceAccess(id);
  const prisma = getPrisma();

  const user = await prisma.user.findFirst({ where: { id: userId, serviceId: service.id } });
  if (!user) notFound();

  const [identities, sessions, events, activeTokens, passkeys] = await Promise.all([
    prisma.identity.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    prisma.loginEvent.findMany({
      where: { serviceId: service.id, OR: [{ userId: user.id }, ...(user.email ? [{ email: user.email }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } } }),
    listPasskeys(user.email),
  ]);
  const label = user.email ?? user.name ?? user.id;

  return (
    <Page>
      <BackLink href={`/console/services/${service.id}/users`} label="사용자" />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} title={label} subtitle="사용자 상세" />

        <Block title="정보">
          <InfoRow label="사용자 ID">
            <code className="break-all font-mono">{user.id}</code>
          </InfoRow>
          <InfoRow label="이메일">{user.email ?? "없음"}</InfoRow>
          {user.name && <InfoRow label="이름">{user.name}</InfoRow>}
          <InfoRow label="로그인 수단">
            {identities
              .map((i) => i.provider)
              .filter(isLoginMethod)
              .map((p) => LOGIN_METHOD_LABELS[p])
              .join(", ") || "없음"}
          </InfoRow>
          <InfoRow label="가입">{dateTime.format(user.createdAt)}</InfoRow>
          <InfoRow label="마지막 로그인">{user.lastLoginAt ? dateTime.format(user.lastLoginAt) : "없음"}</InfoRow>
          <InfoRow label="상태">
            {user.disabledAt ? (
              <span className="text-content-negative">정지 ({dateTime.format(user.disabledAt)}부터)</span>
            ) : (
              "사용 중"
            )}
          </InfoRow>
        </Block>

        <Block title="관리">
          <UserActions serviceId={service.id} userId={user.id} label={label} disabled={!!user.disabledAt} />
        </Block>

        <Block
          title="로그인된 기기"
          description={`로그인 유지 중인 브라우저 ${sessions.length}개, 살아 있는 refresh token ${activeTokens}개`}
        >
          {sessions.length === 0 ? (
            <p className="rounded-lg border border-base p-4 text-footnote text-tertiary">로그인 유지 중인 기기가 없어요.</p>
          ) : (
            sessions.map((s) => (
              <InfoRow key={s.id} label={describeUserAgent(s.userAgent)}>
                <span className="text-tertiary">
                  마지막 사용 {dateTime.format(s.lastSeenAt)}
                  {s.ip && ` / ${s.ip}`}
                </span>
              </InfoRow>
            ))
          )}
        </Block>

        <Block title="패스키" description="이메일에 붙은 패스키라 다른 서비스와 같이 쓰여요. 삭제는 사용자 본인이 계정 화면에서 해요.">
          {passkeys.length === 0 ? (
            <p className="rounded-lg border border-base p-4 text-footnote text-tertiary">저장한 패스키가 없어요.</p>
          ) : (
            passkeys.map((p) => (
              <InfoRow key={p.id} label={`${dateTime.format(p.createdAt)} 저장`}>
                <span className="text-tertiary">{p.lastUsedAt ? `마지막 사용 ${dateTime.format(p.lastUsedAt)}` : "사용한 적 없음"}</span>
              </InfoRow>
            ))
          )}
        </Block>

        <Block title="최근 기록" description="최근 30개">
          {events.length === 0 ? (
            <p className="rounded-lg border border-base p-4 text-footnote text-tertiary">기록이 없어요.</p>
          ) : (
            <ol className="flex flex-col">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-base py-2.5 last:border-0">
                  <span className={`w-10 text-footnote font-strong ${e.type === "failure" ? "text-content-negative" : "text-primary"}`}>
                    {EVENT_LABEL[e.type] ?? e.type}
                  </span>
                  <span className="text-footnote text-secondary">
                    {[e.method && (METHOD_LABEL[e.method] ?? e.method), e.reason && (REASON_LABEL[e.reason] ?? e.reason)]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                  <span className="ml-auto text-label text-tertiary">
                    {dateTime.format(e.createdAt)}
                    {e.ip && ` / ${e.ip}`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Block>
      </div>
    </Page>
  );
}
