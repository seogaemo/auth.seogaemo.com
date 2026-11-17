import type { Service } from "@prisma/client";

import { getPrisma } from "@/cloudflare";

/**
 * 가입 받기 설정. 끄면 새 사용자를 만들지 않는다 (이미 가입한 사용자는 로그인한다).
 * 이메일, 도메인으로 누구를 받을지는 접근 제한(lib/allowlist.ts)이 따로 정한다.
 */
export type SignupBlock = "closed";

export function signupBlock(service: Pick<Service, "signupEnabled">): SignupBlock | null {
  return service.signupEnabled ? null : "closed";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function signupBlockMessage(_service: unknown, _block: SignupBlock) {
  return "이 서비스는 지금 새로 가입할 수 없어요. 이미 가입한 이메일로 로그인하세요.";
}

export class SignupBlockedError extends Error {
  constructor(readonly block: SignupBlock) {
    super(`signup blocked: ${block}`);
  }
}

/** 이 서비스에 이 이메일의 사용자가 이미 있는지 (어떤 로그인 수단이든) */
export async function userExists(serviceId: string, email: string) {
  return (await getPrisma().user.count({ where: { serviceId, email } })) > 0;
}
