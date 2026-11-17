import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getPrisma } from "@/cloudflare";
import { hashSecret } from "./crypto";

type Profile = { name?: string; image?: string };

/**
 * 이메일로 Gravatar의 표시 이름과 프로필 사진을 찾는다.
 * 등록하지 않았거나, 실패하거나, 시간이 넘으면 빈 값을 돌려준다. 던지지 않는다.
 */
export async function gravatarProfile(email: string, timeoutMs = 1500): Promise<Profile> {
  const hash = await hashSecret(email.trim().toLowerCase());
  const signal = AbortSignal.timeout(timeoutMs);
  const apiKey = getCloudflareContext().env.GRAVATAR_API_KEY;

  const [profile, avatar] = await Promise.allSettled([
    fetch(`https://api.gravatar.com/v3/profiles/${hash}`, {
      signal,
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    }).then((r) => (r.ok ? (r.json() as Promise<{ display_name?: string }>) : null)),
    // d=404: 사진을 등록하지 않았으면 기본 그림 대신 404
    fetch(`https://gravatar.com/avatar/${hash}?d=404`, { method: "HEAD", signal }).then((r) => r.ok),
  ]);

  const name = profile.status === "fulfilled" ? profile.value?.display_name?.trim() : undefined;
  const hasAvatar = avatar.status === "fulfilled" && avatar.value;
  return {
    name: name || undefined,
    // 해시로 만든 주소는 바뀌지 않고, 사진을 바꾸면 같은 주소에서 새 사진이 나온다
    image: hasAvatar ? `https://gravatar.com/avatar/${hash}?s=256` : undefined,
  };
}

/** 비어 있는 name, image만 Gravatar 값으로 채운다. 이미 있는 값은 덮어쓰지 않는다. */
async function fillFromGravatar(user: { id: string; email: string | null; name: string | null; image: string | null }) {
  if (!user.email || (user.name && user.image)) return;

  const found = await gravatarProfile(user.email, 5000);
  const data: Profile = {};
  if (!user.name && found.name) data.name = found.name;
  if (!user.image && found.image) data.image = found.image;
  if (!data.name && !data.image) return;

  // 그 사이 다른 경로로 채워졌으면 건드리지 않는다
  const prisma = getPrisma();
  if (data.name) await prisma.user.updateMany({ where: { id: user.id, OR: [{ name: null }, { name: "" }] }, data: { name: data.name } });
  if (data.image) await prisma.user.updateMany({ where: { id: user.id, OR: [{ image: null }, { image: "" }] }, data: { image: data.image } });
}

/** 로그인 응답을 막지 않고 백그라운드에서 채운다. 실패는 무시한다. */
export function refreshFromGravatarInBackground(user: Parameters<typeof fillFromGravatar>[0]) {
  if (!user.email || (user.name && user.image)) return;
  const task = fillFromGravatar(user).catch((error) => console.warn("gravatar refresh failed", error));
  try {
    getCloudflareContext().ctx.waitUntil(task);
  } catch {
    // 요청 컨텍스트가 없으면 promise만 흘려보낸다
  }
}
