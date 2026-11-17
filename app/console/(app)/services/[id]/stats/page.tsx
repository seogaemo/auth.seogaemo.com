import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Block, Page } from "@/components/console/ui";
import { getPrisma } from "@/cloudflare";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "통계" };

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
 * 최근 14일 로그인 통계 (LoginEvent). 그래프는 하루 로그인 수 하나만 그리고,
 * 가입과 실패는 아래 표와 숫자 카드로 본다 (축이 다른 값을 한 그래프에 섞지 않는다).
 */
export default async function StatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const prisma = getPrisma();

  const now = Date.now();
  // 오늘(한국 시간) 포함 14일
  const firstDay = kstDay(new Date(now - (DAYS - 1) * DAY_MS));
  const since = new Date(new Date(`${firstDay}T00:00:00+09:00`).getTime());

  const [rows, totalUsers, active7, active30] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT date(createdAt, '+9 hours') AS day, type, COUNT(*) AS n
      FROM LoginEvent
      WHERE serviceId = ${service.id} AND createdAt >= ${since.toISOString()}
      GROUP BY day, type`,
    prisma.user.count({ where: { serviceId: service.id } }),
    prisma.user.count({ where: { serviceId: service.id, lastLoginAt: { gte: new Date(now - 7 * DAY_MS) } } }),
    prisma.user.count({ where: { serviceId: service.id, lastLoginAt: { gte: new Date(now - 30 * DAY_MS) } } }),
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
    <Page wide>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="통계 / 최근 14일, 한국 시간" />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="전체 사용자" value={totalUsers} />
          <Tile label="7일 활성" value={active7} note="7일 안에 로그인" />
          <Tile label="30일 활성" value={active30} note="30일 안에 로그인" />
          <Tile label="14일 가입" value={sum("signup")} />
          <Tile label="14일 로그인 실패" value={sum("failure")} />
        </div>

        <Block title="하루 로그인" description={`14일 합계 ${sum("login").toLocaleString("ko-KR")}번. 로그인 유지로 바로 넘어간 것도 포함해요.`}>
          <figure className="rounded-lg border border-base bg-base-elevated p-4">
            <div className="flex h-44 items-end gap-[2px] border-b border-base" aria-hidden>
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
                <span key={d.key} className="flex-1 text-center text-caption text-tertiary">
                  {(DAYS - 1 - i) % 2 === 0 ? dayLabel.format(d.date) : ""}
                </span>
              ))}
            </div>
            <figcaption className="sr-only">하루 로그인 수 막대그래프. 같은 값이 아래 표에 있어요.</figcaption>
          </figure>

          <details className="rounded-lg border border-base bg-base-elevated">
            <summary className="cursor-pointer px-4 py-3 text-footnote font-strong text-primary">표로 보기</summary>
            <div className="overflow-x-auto px-4 pb-3">
              <table className="w-full min-w-[360px] text-left">
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
        </Block>
      </div>
    </Page>
  );
}
