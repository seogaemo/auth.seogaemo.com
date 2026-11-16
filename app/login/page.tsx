import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginShell } from "@/components/login/LoginShell";
import { ProviderButton } from "@/components/login/ProviderButton";
import { ServiceHeading } from "@/components/login/ServiceHeading";
import { LOGIN_TX_COOKIE } from "@/lib/config";
import { isProviderConfigured } from "@/lib/oauth/providers";
import { findActiveTransaction } from "@/lib/oauth/transaction";
import { getProviders } from "@/lib/service";

export const dynamic = "force-dynamic";

async function currentTransaction() {
  return findActiveTransaction((await cookies()).get(LOGIN_TX_COOKIE)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const transaction = await currentTransaction();
  return { title: transaction ? `${transaction.service.name} 로그인` : "로그인" };
}

export default async function LoginPage() {
  const transaction = await currentTransaction();
  if (!transaction) redirect("/login/error?code=expired");

  const { service } = transaction;
  const providers = getProviders(service).filter(isProviderConfigured);
  if (providers.length === 0) redirect("/login/error?code=no_provider");

  return (
    <LoginShell branding={service}>
      <ServiceHeading
        name={service.name}
        logoUrl={service.logoKey ? `/service-logo/${service.id}` : null}
      />
      <nav aria-label="로그인 방식" className="flex flex-col gap-3">
        {providers.map((provider) => (
          <ProviderButton key={provider} provider={provider} />
        ))}
      </nav>
    </LoginShell>
  );
}
