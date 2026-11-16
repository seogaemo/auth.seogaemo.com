import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LOGIN_TX_COOKIE } from "@/lib/config";
import { isProviderConfigured, providerLabel } from "@/lib/oauth/providers";
import { findActiveTransaction } from "@/lib/oauth/transaction";
import { getProviders } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const transaction = await findActiveTransaction(
    (await cookies()).get(LOGIN_TX_COOKIE)?.value,
  );
  if (!transaction) redirect("/login/error?code=expired");

  const providers = getProviders(transaction.service).filter(isProviderConfigured);

  return (
    <main>
      <h1>{transaction.service.name}에 로그인하기</h1>
      <ul>
        {providers.map((provider) => (
          <li key={provider}>
            <a href={`/oauth/provider/${provider}/start`}>{providerLabel(provider)}로 로그인</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
