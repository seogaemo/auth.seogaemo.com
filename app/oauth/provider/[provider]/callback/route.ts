import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPrisma } from "@/cloudflare";
import { isEmailAllowed } from "@/lib/allowlist";
import { isSocialProvider, LOGIN_TX_COOKIE } from "@/lib/config";
import { loginErrorUrl } from "@/lib/oauth/errors";
import { completeProviderLogin } from "@/lib/oauth/providers";
import { clientRedirectUrl, finishLogin } from "@/lib/oauth/complete";
import { redirectToClientUrl } from "@/lib/oauth/transaction";
import { upsertUserFromProfile } from "@/lib/oauth/users";

export const dynamic = "force-dynamic";

/**
 * response_mode=form_post 제공자(Apple 등)는 결과를 POST로 보낸다. 다른 사이트에서 온 POST에는
 * SameSite=Lax인 로그인 쿠키가 실리지 않으므로, 같은 값을 쿼리로 옮겨 GET으로 다시 보낸다.
 * 최상위 GET 이동에는 Lax 쿠키가 실려서 아래 GET이 평소처럼 state와 쿠키를 함께 확인한다.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  for (const [key, value] of form?.entries() ?? []) {
    if (typeof value === "string" && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

/** 외부 제공자 로그인이 끝나면 돌아오는 곳. 사용자를 확정하고 서비스에 code를 넘긴다. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const query = new URL(request.url).searchParams;
  const providerState = query.get("state");
  if (!isSocialProvider(provider) || !providerState) {
    return NextResponse.redirect(loginErrorUrl("expired"), 302);
  }

  const prisma = getPrisma();
  const transaction = await prisma.loginTransaction.findUnique({
    where: { providerState },
    include: { service: { select: { restrictLogin: true, allowedEmails: true } } },
  });
  const cookieTxId = (await cookies()).get(LOGIN_TX_COOKIE)?.value;

  // state가 이 브라우저에서 시작한 로그인과 맞는지 확인한다 (CSRF, 로그인 가로채기 방지)
  if (
    !transaction ||
    transaction.id !== cookieTxId ||
    transaction.provider !== provider ||
    transaction.expiresAt < new Date()
  ) {
    return NextResponse.redirect(loginErrorUrl("expired"), 302);
  }

  const code = query.get("code");
  if (!code) {
    // 사용자가 동의 화면에서 취소한 경우 등
    await prisma.loginTransaction.delete({ where: { id: transaction.id } });
    return redirectToClientUrl(
      clientRedirectUrl(transaction, { error: "access_denied", error_description: "login was cancelled" }),
    );
  }

  // 같은 state로 다시 들어오지 못하게 먼저 소비한다
  await prisma.loginTransaction.update({
    where: { id: transaction.id },
    data: { providerState: null },
  });

  let user;
  try {
    const profile = await completeProviderLogin(provider, code, transaction.providerCodeVerifier);
    // 허용 목록은 제공자가 확인한 이메일로만 맞춘다. 목록 밖이면 사용자를 만들지 않는다.
    if (!isEmailAllowed(transaction.service, profile.emailVerified ? profile.email : null)) {
      await prisma.loginTransaction.deleteMany({ where: { id: transaction.id } });
      return NextResponse.redirect(loginErrorUrl("not_allowed"), 302);
    }
    user = await upsertUserFromProfile(transaction.serviceId, provider, profile);
  } catch (error) {
    console.error("provider login failed", provider, error);
    await prisma.loginTransaction.deleteMany({ where: { id: transaction.id } });
    return NextResponse.redirect(loginErrorUrl("provider_failed"), 302);
  }

  return redirectToClientUrl(await finishLogin(transaction, user.id));
}
