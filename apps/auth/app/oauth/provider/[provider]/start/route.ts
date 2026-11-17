import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { isSocialProvider, LOGIN_TX_COOKIE } from "@/lib/config";
import { randomToken } from "@/lib/crypto";
import { loginErrorUrl } from "@/lib/oauth/errors";
import {
  buildProviderAuthorizeUrl,
  isProviderConfigured,
  providerUsesPkce,
} from "@/lib/oauth/providers";
import { findActiveTransaction } from "@/lib/oauth/transaction";
import { getProviders } from "@/lib/service";

export const dynamic = "force-dynamic";

/** 로그인 화면에서 고른 외부 제공자로 보낸다 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const transaction = await findActiveTransaction(
    (await cookies()).get(LOGIN_TX_COOKIE)?.value,
  );
  if (!transaction) return NextResponse.redirect(loginErrorUrl("expired"), 302);

  if (
    !isSocialProvider(provider) ||
    !getProviders(transaction.service).includes(provider) ||
    !isProviderConfigured(provider)
  ) {
    return NextResponse.redirect(new URL("/login", request.url), 302);
  }

  const providerState = randomToken();
  const codeVerifier = providerUsesPkce(provider) ? randomToken(48) : null;

  await getPrisma().loginTransaction.update({
    where: { id: transaction.id },
    data: { provider, providerState, providerCodeVerifier: codeVerifier },
  });

  const url = await buildProviderAuthorizeUrl(provider, providerState, codeVerifier);
  return NextResponse.redirect(url.toString(), 302);
}
