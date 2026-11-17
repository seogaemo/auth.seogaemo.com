import type { AuditLog } from "@prisma/client";

const dateTime = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

const ACTION_LABEL: Record<string, string> = {
  "settings.update": "앱 설정을 바꿈",
  "redirects.update": "Redirect URI를 바꿈",
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

/** 콘솔에서 이 앱에 한 일 (누가, 언제, 무엇을) */
export function ActivityList({ logs }: { logs: AuditLog[] }) {
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
            {log.target && <span className="text-secondary">: {log.target}</span>}
          </span>
          <span className="text-label text-tertiary">{dateTime.format(log.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}
