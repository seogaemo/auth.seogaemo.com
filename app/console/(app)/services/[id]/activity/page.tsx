import Link from "next/link";

import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Page } from "@/components/console/ui";
import { getPrisma } from "@/cloudflare";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "활동 기록" };

const PAGE_SIZE = 50;
const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

const ACTION_LABEL: Record<string, string> = {
  "settings.update": "로그인 설정을 바꿈",
  "signup.update": "가입과 약관 설정을 바꿈",
  "access.update": "접근 제한을 바꿈",
  "branding.update": "브랜딩을 바꿈",
  "secret.rotate": "Client Secret을 새로 발급함",
  "member.add": "관리자를 추가함",
  "member.remove": "관리자를 뺌",
  "member.leave": "관리자에서 나감",
  "user.delete": "사용자를 지움",
  "user.disable": "사용자를 정지함",
  "user.enable": "사용자 정지를 풂",
  "user.sessions.revoke": "사용자를 모든 기기에서 로그아웃시킴",
};

/** 콘솔에서 이 앱에 한 일 (누가, 언제, 무엇을). 앱을 지우면 같이 지워진다. */
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const prisma = getPrisma();
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where: { serviceId: service.id } }),
    prisma.auditLog.findMany({
      where: { serviceId: service.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/console/services/${service.id}/activity`;

  return (
    <Page>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-6">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="활동 기록" />

        {logs.length === 0 ? (
          <p className="rounded-lg border border-base p-5 text-footnote text-tertiary">
            아직 기록이 없어요. 설정, 브랜딩, 관리자, 사용자를 바꾸면 여기에 남아요.
          </p>
        ) : (
          <ol className="flex flex-col rounded-lg border border-base bg-base-elevated">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-col gap-0.5 border-b border-base px-4 py-3 last:border-0">
                <span className="text-footnote text-primary">
                  <span className="font-strong">{log.actorEmail ?? "알 수 없는 개발자"}</span>
                  {" / "}
                  {ACTION_LABEL[log.action] ?? log.action}
                  {log.target && <span className="text-secondary">: {log.target}</span>}
                </span>
                <span className="text-label text-tertiary">{dateTime.format(log.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}

        {pages > 1 && (
          <nav aria-label="페이지" className="flex justify-center gap-4 py-4 text-footnote">
            {page > 1 && (
              <Link href={`${base}?page=${page - 1}`} className="text-content-accent">
                이전
              </Link>
            )}
            <span className="text-tertiary">
              {page} / {pages}
            </span>
            {page < pages && (
              <Link href={`${base}?page=${page + 1}`} className="text-content-accent">
                다음
              </Link>
            )}
          </nav>
        )}
      </div>
    </Page>
  );
}
