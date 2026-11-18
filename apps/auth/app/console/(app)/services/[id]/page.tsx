import Link from "next/link";

import { getPrisma } from "@/cloudflare";
import { CopyField } from "@/components/console/CopyField";
import { LoginStats } from "@/components/console/LoginStats";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Block, Notice, Page } from "@/components/console/ui";
import { requireServiceAccess } from "@/lib/console/session";
import { getRedirectUris } from "@/lib/service";

export const metadata = { title: "개요" };

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" });

const FAILURE_REASON: Record<string, string> = {
  wrong_password: "비밀번호 틀림",
  locked: "잠김",
  wrong_code: "코드 틀림",
  disabled: "정지된 계정",
  rate_limited: "요청 과다",
  signup_closed: "가입 막힘",
  not_allowed: "허용 목록 밖",
};

function Step({ done, title, description, href, action }: { done: boolean; title: string; description: string; href?: string; action?: string }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-base bg-base-elevated px-4 py-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${done ? "border-[var(--content-accent)] bg-[var(--content-accent)]" : "border-base"}`}
      >
        {done && (
          <svg aria-hidden viewBox="0 0 16 16" width={12} height={12}>
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-white" />
          </svg>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-footnote font-strong ${done ? "text-tertiary" : "text-primary"}`}>
          <span className="sr-only">{done ? "완료: " : "할 일: "}</span>
          {title}
        </span>
        <span className="text-label text-tertiary">{description}</span>
      </span>
      {href && action && !done && (
        <Link
          href={href}
          className="flex min-h-6 shrink-0 items-center rounded text-label font-strong text-content-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] focus-visible:ring-offset-2"
        >
          {action}
        </Link>
      )}
    </li>
  );
}

/**
 * 앱 첫 화면. 아직 아무도 로그인하지 않았으면 붙이기까지 남은 일(실제 상태로 체크),
 * 사용자가 생기면 최근 14일 숫자와 최근 로그인 실패.
 */
export default async function ServiceOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const { service } = await requireServiceAccess(id);
  const prisma = getPrisma();
  const base = `/console/services/${service.id}`;

  const [totalUsers, failures] = await Promise.all([
    prisma.user.count({ where: { serviceId: service.id } }),
    prisma.loginEvent.findMany({
      where: { serviceId: service.id, type: "failure" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <Page wide>
      <BackLink href="/console" label="앱 목록" />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="개요" />
        {created && <Notice tone="positive">앱을 만들었어요. 아래 순서대로 로그인을 붙여 보세요.</Notice>}

        {totalUsers === 0 ? (
          <Block title="시작하기" description="첫 사용자가 로그인하면 이 자리에 사용 현황이 나와요.">
            <CopyField label="Client ID" value={service.clientId} />
            <ol className="flex flex-col gap-2">
              <Step
                done={getRedirectUris(service).length > 0}
                title="Redirect URI 등록"
                description="로그인이 끝나면 돌아갈 앱의 주소예요."
                href={`${base}/integration`}
                action="등록하기"
              />
              <Step
                done={false}
                title="예시 코드로 로그인 붙이기"
                description="Client ID와 주소를 채운 Auth.js, oidc-client-ts 코드가 있어요."
                href={`${base}/integration`}
                action="코드 보기"
              />
              <Step
                done={!!service.logoKey || !!service.brandColor}
                title="로그인 화면 꾸미기"
                description="로고, 색, 보여줄 로그인 방식을 정해요."
                href={`${base}/branding`}
                action="꾸미기"
              />
            </ol>
            <p className="text-footnote text-secondary">
              AI 코딩 도구로 개발한다면{" "}
              <Link
                href={`${base}/integration`}
                className="rounded font-strong text-content-accent underline decoration-1 underline-offset-2 hover:decoration-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)]"
              >
                연동 화면의 AI용 안내
              </Link>
              를 복사해 붙여 넣으세요. 위에서 아직 안 된 설정도 AI가 안내해 줘요.
            </p>
          </Block>
        ) : (
          <>
            <LoginStats serviceId={service.id} totalUsers={totalUsers} />
            {failures.length > 0 && (
              <Block title="최근 로그인 실패" description="문의가 오면 사용자를 눌러 상태와 기록을 보세요.">
                <ul className="flex flex-col rounded-lg border border-base bg-base-elevated">
                  {failures.map((event) => {
                    const who = event.email ?? event.userId ?? "알 수 없음";
                    return (
                      <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-base px-4 py-3 last:border-0">
                        {event.userId ? (
                          <Link
                            href={`${base}/users/${event.userId}`}
                            className="min-w-0 rounded text-footnote text-primary underline decoration-[var(--border-base)] underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] [overflow-wrap:anywhere]"
                          >
                            {who}
                          </Link>
                        ) : (
                          <span className="min-w-0 text-footnote text-primary [overflow-wrap:anywhere]">{who}</span>
                        )}
                        <span className="text-label text-secondary">{FAILURE_REASON[event.reason ?? ""] ?? event.reason ?? "실패"}</span>
                        <span className="ml-auto text-label text-tertiary">{dateTime.format(event.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Block>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
