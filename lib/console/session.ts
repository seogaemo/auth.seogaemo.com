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
 * 로그인한 개발자가 소유한 서비스. 남의 서비스면 404 (존재 여부도 알려주지 않는다).
 */
export async function requireOwnedService(serviceId: string) {
  const developer = await requireDeveloper();
  const service = await getPrisma().service.findUnique({ where: { id: serviceId } });
  if (!service || service.isSystem || service.ownerId !== developer.id) notFound();
  return { developer, service };
}
