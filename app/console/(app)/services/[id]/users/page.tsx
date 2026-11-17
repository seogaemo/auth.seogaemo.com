import Link from "next/link";

import { ProviderIcons } from "@/components/console/ProviderIcons";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Page } from "@/components/console/ui";
import { getPrisma } from "@/cloudflare";
import { isEmailAllowed } from "@/lib/allowlist";
import { isProvider } from "@/lib/config";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "사용자" };

const PAGE_SIZE = 50;
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const query = await searchParams;
  const page = Math.max(1, Number(query.page) || 1);
  const q = query.q?.trim().toLowerCase().slice(0, 100) ?? "";

  // 이메일, 이름, 사용자 id 일부로 찾는다
  const where = {
    serviceId: service.id,
    ...(q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }, { id: q }] } : {}),
  };

  const prisma = getPrisma();
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { identities: { select: { provider: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/console/services/${service.id}/users`;
  const pageHref = (n: number) => `${base}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`;

  return (
    <Page wide>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-6">
        <ServiceHeader
          id={service.id}
          name={service.name}
          hasLogo={!!service.logoKey}
          subtitle={`${q ? "찾은" : "전체"} 사용자 ${total.toLocaleString("ko-KR")}명`}
        />

        <form role="search" action={base} className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            사용자 찾기
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="이메일, 이름, 사용자 ID"
            className="h-10 min-w-0 flex-1 rounded-lg border border-base bg-base-elevated px-3 text-footnote text-primary placeholder:text-unselected focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] focus-visible:ring-offset-2"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-lg border border-base bg-base-elevated px-4 text-footnote font-strong text-primary hover:bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--content-accent)] focus-visible:ring-offset-2"
          >
            찾기
          </button>
          {q && (
            <Link href={base} className="flex h-10 shrink-0 items-center rounded-lg px-2 text-footnote text-tertiary hover:text-primary">
              지우기
            </Link>
          )}
        </form>

        {users.length === 0 ? (
          <p className="rounded-lg border border-base p-5 text-footnote text-tertiary">
            {q ? `"${q}"에 맞는 사용자가 없어요. 다른 말로 찾거나 지우기를 누르세요.` : "아직 로그인한 사용자가 없어요."}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="h-8 border-b border-base [&>th+th]:border-l [&>th+th]:border-base">
                  <th className="px-2 text-footnote font-default text-tertiary">사용자</th>
                  <th className="px-2 text-footnote font-default text-tertiary">인증 방식</th>
                  <th className="px-2 text-footnote font-default text-tertiary">마지막 로그인</th>
                  <th className="px-2 text-footnote font-default text-tertiary">상태</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="relative h-12 border-b border-base hover:bg-base [&>td+td]:border-l [&>td+td]:border-base"
                  >
                    <td className="px-2">
                      <span className="flex items-center gap-1.5">
                        <Link
                          href={`${base}/${user.id}`}
                          className="text-footnote text-primary after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--content-accent)]"
                        >
                          {user.email ?? user.name ?? "이름 없음"}
                        </Link>
                        {!isEmailAllowed(service, user.email) && (
                          <span
                            title="접근 제한의 허용 목록에 없어서 로그인할 수 없어요"
                            className="shrink-0 rounded bg-warning-elevated px-1.5 py-0.5 text-caption font-strong text-secondary"
                          >
                            허용 목록 밖
                          </span>
                        )}
                      </span>
                      <span className="block font-mono text-caption text-tertiary">{user.id}</span>
                    </td>
                    <td className="px-2">
                      <ProviderIcons enabled={user.identities.map((i) => i.provider).filter(isProvider)} />
                    </td>
                    <td className="px-2 text-footnote text-tertiary">
                      {user.lastLoginAt ? dateFormat.format(user.lastLoginAt) : "-"}
                    </td>
                    <td className="px-2 text-footnote">
                      {user.disabledAt ? (
                        <span className="rounded bg-negative-elevated px-1.5 py-0.5 text-label font-strong text-content-negative">정지</span>
                      ) : (
                        <span className="text-tertiary">사용 중</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav aria-label="페이지" className="flex justify-center gap-4 py-6 text-footnote">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="text-content-accent">
                이전
              </Link>
            )}
            <span className="text-tertiary">
              {page} / {pages}
            </span>
            {page < pages && (
              <Link href={pageHref(page + 1)} className="text-content-accent">
                다음
              </Link>
            )}
          </nav>
        )}
      </div>
    </Page>
  );
}
