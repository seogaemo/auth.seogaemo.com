import { getPrisma } from "@/cloudflare";
import type { Provider } from "../config";
import type { ProviderProfile } from "./providers";

/**
 * 외부 제공자 프로필로 이 서비스의 사용자를 찾거나 만든다.
 *
 * 1. 같은 (서비스, 제공자, 제공자 id) Identity가 있으면 그 사용자
 * 2. 없고, 제공자가 검증한 이메일이 같은 사용자가 있으면 그 사용자에 Identity를 연결
 * 3. 둘 다 아니면 새 사용자
 *
 * 검증되지 않은 이메일로는 연결하지 않는다. 남의 이메일로 가입해 계정을 가로채는 것을 막기 위해서다.
 */
export async function upsertUserFromProfile(
  serviceId: string,
  provider: Provider,
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
    return prisma.user.update({
      where: { id: identity.userId },
      data: {
        lastLoginAt: now,
        name: identity.user.name ?? profile.name,
        image: identity.user.image ?? profile.image,
      },
    });
  }

  const existing = verifiedEmail
    ? await prisma.user.findUnique({
        where: { serviceId_email: { serviceId, email: verifiedEmail } },
      })
    : null;

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        serviceId,
        email: verifiedEmail,
        name: profile.name,
        image: profile.image,
      },
    }));

  await prisma.identity.create({
    data: {
      serviceId,
      userId: user.id,
      provider,
      providerUserId: profile.id,
      email: profile.email,
    },
  });

  return prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
}
