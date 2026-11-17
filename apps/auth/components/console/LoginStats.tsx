import { getPrisma } from "@/cloudflare";
import { Block } from "@/components/console/ui";

const DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;
const dayLabel = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" });
const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" });

type Row = { day: string; type: string; n: number | bigint };

/** 한국 시간 기준 날짜 키 (YYYY-MM-DD) */
function kstDay(date: Date) {
  return new Date(date.getTime() + KST_MS).toISOString().slice(0, 10);
}

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-base bg-base-elevated p-4">
      <span className="text-label text-tertiary">{label}</span>
      <span className="font-mono text-[24px] font-[500] tabular-nums leading-none tracking-[-0.04em] text-primary">
        {value.toLocaleString("ko-KR")}
      </span>
      {note && <span className="text-label text-tertiary">{note}</span>}
    </div>
  );
}

/**
 * 최근 14일 사용 현황 (LoginEvent). 그래프는 하루 로그인 수 하나만 그리고,
 * 가입과 실패는 숫자 카드와 표로 본다 (축이 다른 값을 한 그래프에 섞지 않는다).
 */
export async function LoginStats({ serviceId, totalUsers }: { serviceId: string; totalUsers: number }) {
  const prisma = getPrisma();
  const now = Date.now();
  // 오늘(한국 시간) 포함 14일
  const firstDay = kstDay(new Date(now - (DAYS - 1) * DAY_MS));
  const since = new Date(`${firstDay}T00:00:00+09:00`);

  const [rows, active7] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT date(createdAt, '+9 hours') AS day, type, COUNT(*) AS n
      FROM LoginEvent
      WHERE serviceId = ${serviceId} AND createdAt >= ${since.toISOString()}
      GROUP BY day, type`,
    prisma.user.count({ where: { serviceId, lastLoginAt: { gte: new Date(now - 7 * DAY_MS) } } }),
  ]);

  const days = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000);
    const key = kstDay(date);
    const count = (type: string) => Number(rows.find((r) => r.day === key && r.type === type)?.n ?? 0);
    return { key, date, login: count("login"), signup: count("signup"), failure: count("failure") };
  });
  const sum = (k: "login" | "signup" | "failure") => days.reduce((a, d) => a + d[k], 0);
  const max = Math.max(1, ...days.map((d) => d.login));

  return (
    <Block title="최근 14일" description="한국 시간 기준. 로그인 유지로 화면 없이 넘어간 것도 로그인으로 세요.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="전체 사용자" value={totalUsers} />
        <Tile label="7일 활성" value={active7} note="7일 안에 로그인" />
        <Tile label="가입" value={sum("signup")} />
        <Tile label="로그인 실패" value={sum("failure")} />
      </div>

      <figure className="rounded-lg border border-base bg-base-elevated p-4">
        <figcaption className="pb-3 text-footnote text-secondary">
          하루 로그인 <span className="tabular-nums">(합계 {sum("login").toLocaleString("ko-KR")}번)</span>
        </figcaption>
        <div className="flex h-36 items-end gap-[2px] border-b border-base" aria-hidden>
          {days.map((d) => (
            <div key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-7 rounded-t-[4px] bg-[#2c73f4] group-hover:bg-[#2551a2]"
                style={{ height: `${(d.login / max) * 100}%`, minHeight: d.login > 0 ? 2 : 0 }}
              />
              <span className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded bg-[#101016] px-2 py-1 text-label text-white group-hover:block">
                {dayLabel.format(d.date)} 로그인 {d.login}번
              </span>
            </div>
          ))}
        </div>
        <div className="flex gap-[2px] pt-1.5" aria-hidden>
          {days.map((d, i) => (
            // 오늘부터 거꾸로 2일마다, 좁은 화면은 4일마다 (줄바꿈 없이)
            <span
              key={d.key}
              className={`flex-1 whitespace-nowrap text-center text-caption text-tertiary ${(DAYS - 1 - i) % 4 === 0 ? "" : "invisible md:visible"}`}
            >
              {(DAYS - 1 - i) % 2 === 0 ? dayLabel.format(d.date) : ""}
            </span>
          ))}
        </div>

        <details className="mt-3 border-t border-base pt-2">
          <summary className="cursor-pointer py-1 text-footnote text-secondary hover:text-primary">날짜별 숫자 보기</summary>
          <div className="overflow-x-auto pt-1">
            <table className="w-full min-w-[320px] text-left">
              <thead>
                <tr className="h-8 border-b border-base">
                  <th className="text-footnote font-default text-tertiary">날짜</th>
                  <th className="text-right text-footnote font-default text-tertiary">로그인</th>
                  <th className="text-right text-footnote font-default text-tertiary">가입</th>
                  <th className="text-right text-footnote font-default text-tertiary">실패</th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d.key} className="h-9 border-b border-base last:border-0">
                    <td className="text-footnote text-primary">
                      {dayLabel.format(d.date)} ({weekday.format(d.date)})
                    </td>
                    <td className="text-right text-footnote tabular-nums text-primary">{d.login}</td>
                    <td className="text-right text-footnote tabular-nums text-primary">{d.signup}</td>
                    <td className="text-right text-footnote tabular-nums text-primary">{d.failure}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </Block>
  );
}
