import { getPrisma } from "@/cloudflare";
import { AddMemberForm } from "@/components/console/AddMemberForm";
import { RemoveMemberButton } from "@/components/console/RemoveMemberButton";
import { ServiceHeader } from "@/components/console/ServiceHeader";
import { BackLink, Block, Page } from "@/components/console/ui";
import { requireServiceAccess } from "@/lib/console/session";

export const metadata = { title: "관리자" };

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "accent" }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-caption font-strong ${
        tone === "accent" ? "bg-accent-elevated text-content-accent" : "bg-base text-tertiary"
      }`}
    >
      {children}
    </span>
  );
}

function MemberRow({ email, badges, action }: { email: string; badges: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-base bg-base-elevated px-4 py-3">
      <span className="min-w-0 flex-1 break-all text-footnote text-primary">{email}</span>
      <span className="flex items-center gap-1.5">{badges}</span>
      {action}
    </li>
  );
}

export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { developer, service, isOwner } = await requireServiceAccess(id);

  const prisma = getPrisma();
  const [owner, members] = await Promise.all([
    service.ownerId
      ? prisma.user.findUnique({ where: { id: service.ownerId }, select: { email: true, name: true } })
      : null,
    prisma.serviceMember.findMany({ where: { serviceId: service.id }, orderBy: { createdAt: "asc" } }),
  ]);
  // 아직 콘솔에 가입하지 않은 이메일 표시용
  const joined = new Set(
    (
      await prisma.user.findMany({
        where: { service: { isSystem: true }, email: { in: members.map((m) => m.email) } },
        select: { email: true },
      })
    ).map((u) => u.email),
  );

  return (
    <Page>
      <BackLink href={`/console/services/${service.id}`} label={service.name} />
      <div className="flex flex-col gap-8">
        <ServiceHeader id={service.id} name={service.name} hasLogo={!!service.logoKey} subtitle="관리자" />

        <Block
          title="관리자"
          description="관리자는 설정, 브랜딩, 사용자 관리를 할 수 있어요. 앱 삭제와 관리자 추가는 소유자만 해요."
        >
          <ul className="flex flex-col gap-2">
            <MemberRow
              email={owner?.email ?? owner?.name ?? "알 수 없음"}
              badges={
                <>
                  <Badge tone="accent">소유자</Badge>
                  {isOwner && <Badge>나</Badge>}
                </>
              }
            />
            {members.map((member) => {
              const self = member.email === developer.email;
              return (
                <MemberRow
                  key={member.id}
                  email={member.email}
                  badges={
                    <>
                      <Badge>관리자</Badge>
                      {self && <Badge>나</Badge>}
                      {!joined.has(member.email) && <Badge>콘솔 가입 전</Badge>}
                    </>
                  }
                  action={
                    isOwner || self ? (
                      <RemoveMemberButton serviceId={service.id} memberId={member.id} email={member.email} self={self} />
                    ) : undefined
                  }
                />
              );
            })}
          </ul>
          {members.length === 0 && (
            <p className="text-footnote text-tertiary">아직 소유자 말고 다른 관리자가 없어요.</p>
          )}
        </Block>

        {isOwner && (
          <Block title="관리자 추가">
            <AddMemberForm serviceId={service.id} />
          </Block>
        )}
      </div>
    </Page>
  );
}
