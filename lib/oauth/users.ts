import { getPrisma } from "@/cloudflare";
import type { LoginMethod } from "../config";
import { recordLoginEvent } from "../events";
import { gravatarProfile, refreshFromGravatarInBackground } from "../gravatar";
import { signupBlock, SignupBlockedError } from "../signup-policy";
import type { ProviderProfile } from "./providers";

/**
 * 외부 제공자 프로필로 이 서비스의 사용자를 찾거나 만든다.
 *
 * 1. 같은 (서비스, 제공자, 제공자 id) Identity가 있으면 그 사용자
 * 2. 없고, 제공자가 검증한 이메일이 같은 사용자가 있으면 그 사용자에 Identity를 연결
 * 3. 둘 다 아니면 새 사용자
 *
 * 검증되지 않은 이메일로는 연결하지 않는다. 남의 이메일로 가입해 계정을 가로채는 것을 막기 위해서다.
 * 새 사용자를 만들 때는 서비스의 가입 설정(가입 받기, 허용 도메인)을 따른다. 막히면 SignupBlockedError.
 */
export async function upsertUserFromProfile(
  serviceId: string,
  provider: LoginMethod,
  profile: ProviderProfile,
) {
  const prisma = getPrisma();
  const now = new Date();
  const verifiedEmail = profile.emailVerified ? profile.email?.toLowerCase() : undefined;

  const identity = await prisma.identity.findUnique({
    where: {
      serviceId_provider_providerUserId: {
        serviceId,
        provider,
        providerUserId: profile.id,
      },
    },
    include: { user: true },
  });

  if (identity) {
    const user = await prisma.user.update({
      where: { id: identity.userId },
      data: {
        lastLoginAt: now,
        name: identity.user.name ?? profile.name,
        image: identity.user.image ?? profile.image,
      },
    });
    refreshFromGravatarInBackground(user);
    return user;
  }

  const existing = verifiedEmail
    ? await prisma.user.findUnique({
        where: { serviceId_email: { serviceId, email: verifiedEmail } },
      })
    : null;

  let user = existing;
  if (!user) {
    const service = await prisma.service.findUniqueOrThrow({ where: { id: serviceId } });
    const block = signupBlock(service);
    if (block) throw new SignupBlockedError(block);

    // 가입할 때는 Gravatar를 기다렸다가 같이 저장한다 (최대 1.5초, 실패하면 없이 진행)
    const gravatar =
      verifiedEmail && !(profile.name && profile.image)
        ? await gravatarProfile(verifiedEmail).catch(() => ({}) as { name?: string; image?: string })
        : {};

    user = await prisma.user.create({
      data: {
        serviceId,
        email: verifiedEmail,
        name: profile.name || gravatar.name,
        image: profile.image || gravatar.image,
      },
    });
    await recordLoginEvent({ serviceId, type: "signup", userId: user.id, email: user.email, method: provider });
  }

  await prisma.identity.create({
    data: {
      serviceId,
      userId: user.id,
      provider,
      providerUserId: profile.id,
      email: profile.email,
    },
  });

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  // 기존 사용자에 로그인 수단을 새로 연결한 경우
  if (existing) refreshFromGravatarInBackground(updated);
  return updated;
}
