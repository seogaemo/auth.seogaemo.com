import type { User } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { notifyBackchannel } from "../backchannel";

/**
 * 사용자를 지운다 (본인 탈퇴, 콘솔에서 삭제). 로그인 수단, 토큰, 세션은 cascade로 같이 지워진다.
 *
 * 로그인 기록은 통계(날짜별 로그인 수)에 쓰여서 행은 남기되, 그 사람을 알아볼 수 있는 값(이메일, IP, User-Agent)은 지운다.
 * 실패 기록은 사용자 id 없이 이메일만 있을 수 있어서 이메일로도 찾는다. 남은 행도 90일 뒤 청소(lib/cleanup.ts)로 사라진다.
 * 복구 기간은 없다. 앱에는 바로 계정 삭제(account-purged)를 알린다.
 */
export async function deleteUser(user: Pick<User, "id" | "serviceId" | "email">) {
  const prisma = getPrisma();
  await prisma.loginEvent.updateMany({
    where: {
      serviceId: user.serviceId,
      OR: [{ userId: user.id }, ...(user.email ? [{ email: user.email }] : [])],
    },
    data: { email: null, ip: null, userAgent: null },
  });
  await prisma.user.delete({ where: { id: user.id } });
  await notifyBackchannel(user.serviceId, [{ sub: user.id, purged: true }]);
}
