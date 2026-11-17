import { redirect } from "next/navigation";

import { findServiceByClientId } from "./service";
import { currentBrowserKey, findSession } from "./oauth/session";

/**
 * 계정 화면(/account)의 서비스와 로그인 세션. 세션이 없으면 로그인으로 보낸다.
 * 콘솔(시스템 서비스)은 계정 화면이 없다.
 */
export async function loadAccount(clientId: string | undefined | null) {
  const service = clientId ? await findServiceByClientId(clientId) : null;
  if (!service || service.isSystem) redirect("/login/error?code=invalid_client");

  const session = await findSession(await currentBrowserKey(), service.id);
  if (!session) redirect(`/account/login?client_id=${encodeURIComponent(service.clientId)}`);

  return { service, session, user: session.user };
}
