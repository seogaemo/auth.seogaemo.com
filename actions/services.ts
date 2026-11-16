"use server";

import { revalidatePath } from "next/cache";

import { getPrisma, getR2 } from "@/cloudflare";
import { requireDeveloper, requireServiceAccess } from "@/lib/console/session";
import {
  parseHexColor,
  parseProviders,
  parseRedirectUris,
  parseServiceName,
} from "@/lib/console/validation";
import { hashSecret, randomToken } from "@/lib/crypto";
import { PROVIDERS } from "@/lib/config";

export type ActionState = {
  error?: string;
  /** 브라우저가 이동할 주소 (서버 액션 안의 redirect()는 OpenNext에서 404가 난다) */
  redirectTo?: string;
  message?: string;
  /** 새로 만든 client secret. 이 응답에서 한 번만 보여준다. */
  secret?: string;
  serviceId?: string;
  clientId?: string;
  /** 오류일 때 사용자가 입력한 값을 돌려준다 (React 19는 제출 후 폼을 초기화한다) */
  fields?: Record<string, string>;
} | null;

function echo(form: FormData, ...names: string[]) {
  return Object.fromEntries(names.map((n) => [n, String(form.get(n) ?? "")]));
}

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const LOGO_MAX_BYTES = 250 * 1024;

function newClientSecret() {
  return `sgs_${randomToken(32)}`;
}

export async function createService(_prev: ActionState, form: FormData): Promise<ActionState> {
  const developer = await requireDeveloper();
  const fields = echo(form, "name", "redirectUris", "clientType");

  const parsedName = parseServiceName(form.get("name"));
  if ("error" in parsedName) return { error: parsedName.error, fields };

  const parsedUris = parseRedirectUris(String(form.get("redirectUris") ?? ""));
  if ("error" in parsedUris) return { error: parsedUris.error, fields };

  const isPublic = form.get("clientType") === "public";
  const secret = isPublic ? null : newClientSecret();

  const service = await getPrisma().service.create({
    data: {
      name: parsedName.name,
      clientId: `sg_${randomToken(12)}`,
      clientSecretHash: secret ? await hashSecret(secret) : "",
      redirectUris: parsedUris.uris,
      providers: [...PROVIDERS],
      ownerId: developer.id,
    },
  });

  revalidatePath("/console");
  if (!secret) return { redirectTo: `/console/services/${service.id}?created=1` };
  return { secret, serviceId: service.id, clientId: service.clientId };
}

export async function updateSettings(
  serviceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  await requireServiceAccess(serviceId);
  const fields = echo(form, "name", "redirectUris");

  const parsedName = parseServiceName(form.get("name"));
  if ("error" in parsedName) return { error: parsedName.error, fields };

  const parsedUris = parseRedirectUris(String(form.get("redirectUris") ?? ""));
  if ("error" in parsedUris) return { error: parsedUris.error, fields };

  await getPrisma().service.update({
    where: { id: serviceId },
    data: {
      name: parsedName.name,
      redirectUris: parsedUris.uris,
      providers: parseProviders(form.getAll("providers")),
    },
  });

  revalidatePath(`/console/services/${serviceId}`);
  return { message: "저장했어요." };
}

export async function rotateClientSecret(serviceId: string): Promise<ActionState> {
  const { service } = await requireServiceAccess(serviceId);
  if (service.clientSecretHash === "") {
    return { error: "public client는 client secret을 쓰지 않아요." };
  }

  const secret = newClientSecret();
  await getPrisma().service.update({
    where: { id: serviceId },
    data: { clientSecretHash: await hashSecret(secret) },
  });
  return { secret };
}

export async function deleteService(
  serviceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { service, isOwner } = await requireServiceAccess(serviceId);
  if (!isOwner) return { error: "서비스는 소유자만 지울 수 있어요." };
  if (String(form.get("confirm") ?? "").trim() !== service.name) {
    return { error: "서비스 이름이 맞지 않아요." };
  }

  if (service.logoKey) await getR2().delete(service.logoKey);
  // User, Identity, 토큰은 onDelete: Cascade로 같이 지워진다
  await getPrisma().service.delete({ where: { id: serviceId } });

  // revalidatePath를 하면 Next가 지금 페이지(이미 지운 서비스)를 다시 그리다 404를 먼저 띄운다.
  // 목록은 이동하면서 새로 그려지니 필요 없다.
  return { redirectTo: "/console" };
}

export async function updateBranding(
  serviceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { service } = await requireServiceAccess(serviceId);

  const fields = echo(form, "brandColor", "brandBackground");
  const brand = parseHexColor(form.get("brandColor"));
  if ("error" in brand) return { error: brand.error, fields };
  const background = parseHexColor(form.get("brandBackground"));
  if ("error" in background) return { error: background.error, fields };

  let logoKey = service.logoKey;
  const logo = form.get("logo");

  if (form.get("removeLogo") === "on") {
    if (logoKey) await getR2().delete(logoKey);
    logoKey = null;
  } else if (logo instanceof File && logo.size > 0) {
    if (!LOGO_TYPES.has(logo.type)) return { error: "로고는 PNG, JPG, GIF, WebP만 올릴 수 있어요." };
    if (logo.size > LOGO_MAX_BYTES) return { error: "로고는 250KB까지 올릴 수 있어요." };

    const key = `service-logo/${serviceId}/${randomToken(8)}`;
    await getR2().put(key, await logo.arrayBuffer(), {
      httpMetadata: { contentType: logo.type },
    });
    if (logoKey) await getR2().delete(logoKey);
    logoKey = key;
  }

  await getPrisma().service.update({
    where: { id: serviceId },
    data: { brandColor: brand.color, brandBackground: background.color, logoKey },
  });

  revalidatePath(`/console/services/${serviceId}/branding`);
  return { message: "저장했어요." };
}

export async function deleteServiceUser(serviceId: string, userId: string) {
  await requireServiceAccess(serviceId);
  // serviceId 조건을 같이 걸어 다른 서비스의 사용자를 지우지 못하게 한다
  await getPrisma().user.deleteMany({ where: { id: userId, serviceId } });
  revalidatePath(`/console/services/${serviceId}/users`);
}
