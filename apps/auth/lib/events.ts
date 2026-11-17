import { getPrisma } from "@/cloudflare";
import { clientInfo } from "./request";

export type LoginEventType = "login" | "signup" | "failure";

/**
 * 로그인 기록. 기록이 실패해도 로그인은 계속돼야 하니 오류를 삼킨다.
 */
export async function recordLoginEvent(event: {
  serviceId: string;
  type: LoginEventType;
  userId?: string | null;
  email?: string | null;
  method?: string | null;
  reason?: string | null;
}) {
  try {
    const { ip, userAgent } = await clientInfo();
    await getPrisma().loginEvent.create({
      data: { ...event, ip, userAgent },
    });
  } catch (error) {
    console.error("login event failed", error);
  }
}

/** 콘솔 활동 기록. 실패해도 원래 작업은 끝난 뒤라 오류를 삼킨다. */
export async function recordAudit(
  serviceId: string,
  actor: { id: string; email: string | null },
  action: string,
  target?: string | null,
) {
  try {
    await getPrisma().auditLog.create({
      data: { serviceId, actorId: actor.id, actorEmail: actor.email, action, target: target ?? null },
    });
  } catch (error) {
    console.error("audit log failed", error);
  }
}
