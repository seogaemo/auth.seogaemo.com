import type { AuditLog } from "@prisma/client";
import Link from "next/link";

import { getPrisma } from "@/cloudflare";

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

const ACTION_LABEL: Record<string, string> = {
  "settings.update": "앱 설정을 바꿈",
  "redirects.update": "Redirect URI와 로그아웃 후 이동 주소를 바꿈",
  "idtoken.update": "ID 토큰 서명 방식을 바꿈",
  "tokens.update": "토큰 설정을 바꿈",
  "backchannel.update": "서버 알림(Back-Channel Logout) 주소를 바꿈",
  "login.update": "이름과 로그인 방식을 바꿈",
  "signup.update": "가입과 약관 설정을 바꿈",
  "access.update": "접근 제한을 바꿈",
  "branding.update": "로고와 색을 바꿈",
  "secret.rotate": "Client Secret을 새로 발급함",
  "member.add": "관리자를 추가함",
  "member.remove": "관리자를 뺌",
  "member.leave": "관리자에서 나감",
  "user.delete": "사용자를 지움",
  "user.disable": "사용자를 정지함",
  "user.enable": "사용자 정지를 풂",
  "user.sessions.revoke": "사용자를 모든 기기에서 로그아웃시킴",
};

/**
 * 콘솔에서 이 앱에 한 일 (누가, 언제, 무엇을)
 *
 * user.* 기록의 대상은 사용자 ID로 남긴다. 기록은 1년 가지만 지운 사용자의 이메일까지 1년 남기면 안 되기 때문이다.
 * 아직 있는 사용자는 보여 줄 때 이메일을 찾아 붙인다.
 */
export async function ActivityList({ serviceId, logs }: { serviceId: string; logs: AuditLog[] }) {
  const userIds = [...new Set(logs.filter((log) => log.action.startsWith("user.") && log.target).map((log) => log.target!))];
  const users = userIds.length
    ? await getPrisma().user.findMany({ where: { serviceId, id: { in: userIds } }, select: { id: true, email: true } })
    : [];
  const emails = new Map(users.map((user) => [user.id, user.email]));

  if (logs.length === 0) {
    return (
      <p className="rounded-lg border border-base p-5 text-footnote text-tertiary">
        아직 기록이 없어요. 연동, 로그인 화면, 사용자, 관리자를 바꾸면 여기에 남아요.
      </p>
    );
  }
  return (
    <ol className="flex flex-col rounded-lg border border-base bg-base-elevated">
      {logs.map((log) => (
        <li key={log.id} className="flex flex-col gap-0.5 border-b border-base px-4 py-3 last:border-0">
          <span className="text-footnote text-primary [overflow-wrap:anywhere]">
            <span className="font-strong">{log.actorEmail ?? "알 수 없는 개발자"}</span>
            {" / "}
            {ACTION_LABEL[log.action] ?? log.action}
            {log.target && (
              <span className="text-secondary">
                : <Target serviceId={serviceId} log={log} emails={emails} />
              </span>
            )}
          </span>
          <span className="text-label text-tertiary">{dateTime.format(log.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}

function Target({ serviceId, log, emails }: { serviceId: string; log: AuditLog; emails: Map<string, string | null> }) {
  const target = log.target!;
  if (!log.action.startsWith("user.")) return target;
  if (!emails.has(target)) return <span className="font-mono">지워진 사용자 {target}</span>;
  return (
    <Link
      href={`/console/services/${serviceId}/users/${target}`}
      className="rounded-sm text-content-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)]"
    >
      {emails.get(target) ?? <span className="font-mono">{target}</span>}
    </Link>
  );
}
