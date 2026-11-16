import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LOGIN_TX_COOKIE, type Provider } from "./config";
import { isProviderConfigured } from "./oauth/providers";
import { findActiveTransaction } from "./oauth/transaction";
import { getProviders } from "./service";

/** 로그인 화면들이 공통으로 쓰는 진행 상태. 없으면 오류 화면으로 보낸다. */
export async function loadLoginContext(require?: Provider) {
  const transaction = await findActiveTransaction((await cookies()).get(LOGIN_TX_COOKIE)?.value);
  if (!transaction) redirect("/login/error?code=expired");

  const { service } = transaction;
  const providers = getProviders(service).filter(isProviderConfigured);
  if (providers.length === 0) redirect("/login/error?code=no_provider");
  if (require && !providers.includes(require)) redirect("/login");

  return {
    transaction,
    service,
    providers,
    logoUrl: service.logoKey ? `/service-logo/${service.id}` : null,
  };
}
