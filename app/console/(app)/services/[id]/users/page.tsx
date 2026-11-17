import { deleteServiceUser } from "@/actions/services";
import { DeleteUserButton } from "@/components/console/DeleteUserButton";
import { ProviderIcons } from "@/components/console/ProviderIcons";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Page } from "@/components/console/ui";
import { getPrisma } from "@/cloudflare";
import { isProvider } from "@/lib/config";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "User Management" };

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
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { service } = await requireServiceAccess(id);
  const page = Math.max(1, Number((await searchParams).page) || 1);

  const prisma = getPrisma();
  const [total, users] = await Promise.all([
    prisma.user.count({ where: { serviceId: service.id } }),
    prisma.user.findMany({
      where: { serviceId: service.id },
      include: { identities: { select: { provider: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Page wide>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-8">
        <ServiceHeader
          id={service.id}
          name={service.name}
          hasLogo={!!service.logoKey}
          subtitle={`User Management / 사용자 ${total.toLocaleString("ko-KR")}명`}
        />

        {users.length === 0 ? (
          <p className="rounded-lg border border-base p-5 text-footnote text-tertiary">
            아직 로그인한 사용자가 없어요.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="h-8 border-b border-base [&>th+th]:border-l [&>th+th]:border-base">
                  <th className="px-2 text-footnote font-default text-quaternary">
                    사용자
                  </th>
                  <th className="px-2 text-footnote font-default text-quaternary">
                    인증 방식
                  </th>
                  <th className="px-2 text-footnote font-default text-quaternary">
                    마지막 로그인
                  </th>
                  <th className="px-2 text-footnote font-default text-quaternary">
                    <span className="sr-only">삭제</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="h-12 border-b border-base transition-colors hover:bg-base [&>td+td]:border-l [&>td+td]:border-base"
                  >
                    <td className="px-2">
                      <span className="block text-footnote text-primary">
                        {user.email ?? user.name ?? "이름 없음"}
                      </span>
                      <span className="block font-mono text-caption text-quaternary">
                        {user.id}
                      </span>
                    </td>
                    <td className="px-2">
                      <ProviderIcons
                        enabled={user.identities
                          .map((i) => i.provider)
                          .filter(isProvider)}
                      />
                    </td>
                    <td className="px-2 text-footnote text-tertiary">
                      {user.lastLoginAt
                        ? dateFormat.format(user.lastLoginAt)
                        : "-"}
                    </td>
                    <td className="px-2 text-right">
                      <DeleteUserButton
                        action={deleteServiceUser.bind(
                          null,
                          service.id,
                          user.id,
                        )}
                        label={user.email ?? user.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <nav
            aria-label="페이지"
            className="flex justify-center gap-4 py-6 text-footnote"
          >
            {page > 1 && (
              <a href={`?page=${page - 1}`} className="text-content-accent">
                이전
              </a>
            )}
            <span className="text-tertiary">
              {page} / {pages}
            </span>
            {page < pages && (
              <a href={`?page=${page + 1}`} className="text-content-accent">
                다음
              </a>
            )}
          </nav>
        )}
      </div>
    </Page>
  );
}
