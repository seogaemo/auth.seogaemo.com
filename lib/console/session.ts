import type { Prisma, User } from "@prisma/client/wasm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { getPrisma } from "@/cloudflare";
import { CONSOLE_SESSION_COOKIE } from "../config";
import { verifyConsoleSession } from "../token";

/** 로그인한 개발자 (시스템 서비스의 User). 없으면 null. 요청마다 한 번만 조회한다. */
export const getDeveloper = cache(async () => {
  const token = (await cookies()).get(CONSOLE_SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string | null;
  try {
    userId = await verifyConsoleSession(token);
  } catch {
    return null;
  }
  if (!userId) return null;

  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    include: { service: { select: { isSystem: true } } },
  });
  return user?.service.isSystem ? user : null;
});

export async function requireDeveloper() {
  const developer = await getDeveloper();
  if (!developer) redirect("/console/login");
  return developer;
}

/**
 * 이 개발자가 관리할 수 있는 서비스: 소유자이거나 관리자로 추가된 서비스.
 * 관리자는 콘솔 계정의 이메일로 맞춘다. User.email은 제공자가 확인한 이메일만 저장된다.
 */
export function manageableServices(developer: Pick<User, "id" | "email">): Prisma.ServiceWhereInput {
  const or: Prisma.ServiceWhereInput[] = [{ ownerId: developer.id }];
  if (developer.email) or.push({ members: { some: { email: developer.email } } });
  return { isSystem: false, OR: or };
}

/**
 * 관리할 수 있는 서비스. 아니면 404 (존재 여부도 알려주지 않는다).
 * 서비스 삭제와 관리자 관리처럼 소유자만 하는 일은 isOwner로 따로 확인한다.
 */
export async function requireServiceAccess(serviceId: string) {
  const developer = await requireDeveloper();
  const service = await getPrisma().service.findFirst({
    where: { id: serviceId, ...manageableServices(developer) },
  });
  if (!service) notFound();
  return { developer, service, isOwner: service.ownerId === developer.id };
}
