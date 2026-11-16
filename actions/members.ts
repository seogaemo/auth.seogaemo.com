"use server";

import { revalidatePath } from "next/cache";

import { getPrisma } from "@/cloudflare";
import { endpoint } from "@/lib/config";
import { requireServiceAccess } from "@/lib/console/session";
import { normalizeEmail } from "@/lib/email-auth";
import { isMailConfigured, memberAddedMessage, sendMail } from "@/lib/mail";
import type { ActionState } from "./services";

/** 소유자 말고 둘 수 있는 관리자 수 */
const MAX_MEMBERS = 20;

function membersPath(serviceId: string) {
  return `/console/services/${serviceId}/members`;
}

/** 관리자 추가 (소유자만). 아직 콘솔에 가입하지 않은 이메일도 미리 추가해 둘 수 있다. */
export async function addMember(serviceId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { developer, service, isOwner } = await requireServiceAccess(serviceId);
  if (!isOwner) return { error: "관리자는 소유자만 추가할 수 있어요." };

  const email = normalizeEmail(form.get("email"));
  const fields = { email: String(form.get("email") ?? "") };
  if (!email) return { error: "이메일 주소를 확인하세요.", fields };
  if (email === developer.email) return { error: "소유자는 이미 이 서비스를 관리하고 있어요.", fields };

  const prisma = getPrisma();
  const count = await prisma.serviceMember.count({ where: { serviceId } });
  if (count >= MAX_MEMBERS) return { error: `관리자는 ${MAX_MEMBERS}명까지 둘 수 있어요.`, fields };

  const existing = await prisma.serviceMember.findUnique({
    where: { serviceId_email: { serviceId, email } },
  });
  if (existing) return { error: "이미 관리자예요.", fields };

  await prisma.serviceMember.create({ data: { serviceId, email, invitedById: developer.id } });

  // 알림 메일은 실패해도 추가는 그대로 둔다
  let mailed = false;
  if (isMailConfigured()) {
    try {
      await sendMail({
        to: email,
        ...memberAddedMessage(service.name, developer.email ?? developer.name ?? "소유자", endpoint("/console")),
      });
      mailed = true;
    } catch (error) {
      console.error("member notice mail failed", error);
    }
  }

  revalidatePath(membersPath(serviceId));
  return {
    message: mailed
      ? `${email}을 관리자로 추가하고 알림 메일을 보냈어요.`
      : `${email}을 관리자로 추가했어요. 이 이메일로 콘솔에 로그인하면 바로 관리할 수 있어요.`,
  };
}

/** 관리자 빼기. 소유자는 누구든, 관리자는 자기 자신만 (나가기). */
export async function removeMember(serviceId: string, memberId: string): Promise<ActionState> {
  const { developer, isOwner } = await requireServiceAccess(serviceId);
  const prisma = getPrisma();
  const member = await prisma.serviceMember.findFirst({ where: { id: memberId, serviceId } });
  if (!member) return { error: "이미 빠진 관리자예요." };

  const self = member.email === developer.email;
  if (!isOwner && !self) return { error: "다른 관리자는 소유자만 뺄 수 있어요." };

  await prisma.serviceMember.delete({ where: { id: member.id } });

  // 스스로 나가면 이 서비스 화면을 더 볼 수 없다. 다시 그리면 404가 먼저 뜨니 이동만 한다.
  if (self) return { redirectTo: "/console" };
  revalidatePath(membersPath(serviceId));
  return { message: `${member.email}을 관리자에서 뺐어요.` };
}
