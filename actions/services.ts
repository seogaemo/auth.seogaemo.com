"use server";

import { revalidatePath } from "next/cache";

import { getPrisma, getR2 } from "@/cloudflare";
import { parseAllowlist } from "@/lib/allowlist";
import { requireDeveloper, requireServiceAccess } from "@/lib/console/session";
import {
  parseHexColor,
  parseOptionalHttpsUrl,
  parseProviders,
  parseRedirectUris,
  parseServiceName,
} from "@/lib/console/validation";
import { hashSecret, randomToken } from "@/lib/crypto";
import { PROVIDERS } from "@/lib/config";
import { recordAudit } from "@/lib/events";
import { endAllSessions } from "@/lib/oauth/session";

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
  const { developer } = await requireServiceAccess(serviceId);
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
  await recordAudit(serviceId, developer, "settings.update");

  revalidatePath(`/console/services/${serviceId}/settings`);
  // 이름과 Redirect URI는 개요(예시 코드)에도 보인다
  revalidatePath(`/console/services/${serviceId}`);
  return { message: "저장했어요." };
}

export async function rotateClientSecret(serviceId: string): Promise<ActionState> {
  const { service, developer } = await requireServiceAccess(serviceId);
  if (service.clientSecretHash === "") {
    return { error: "SPA, 모바일 앱은 Client Secret을 쓰지 않아요." };
  }

  const secret = newClientSecret();
  await getPrisma().service.update({
    where: { id: serviceId },
    data: { clientSecretHash: await hashSecret(secret) },
  });
  await recordAudit(serviceId, developer, "secret.rotate");
  return { secret };
}

export async function deleteService(
  serviceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { service, isOwner } = await requireServiceAccess(serviceId);
  if (!isOwner) return { error: "앱은 소유자만 지울 수 있어요." };
  if (String(form.get("confirm") ?? "").trim() !== service.name) {
    return { error: "앱 이름이 맞지 않아요. 띄어쓰기와 대소문자까지 똑같이 입력하세요." };
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
  const { service, developer } = await requireServiceAccess(serviceId);

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
  await recordAudit(serviceId, developer, "branding.update");

  revalidatePath(`/console/services/${serviceId}/branding`);
  return { message: "저장했어요." };
}

/** serviceId 조건을 같이 걸어 다른 서비스의 사용자를 건드리지 못하게 한다 */
async function serviceUser(serviceId: string, userId: string) {
  const access = await requireServiceAccess(serviceId);
  const user = await getPrisma().user.findFirst({ where: { id: userId, serviceId } });
  return { ...access, user };
}

export async function deleteServiceUser(serviceId: string, userId: string) {
  const { developer, user } = await serviceUser(serviceId, userId);
  if (!user) return;
  await getPrisma().user.delete({ where: { id: user.id } });
  await recordAudit(serviceId, developer, "user.delete", user.email ?? user.id);
  revalidatePath(`/console/services/${serviceId}/users`);
}

export async function updateAllowlist(
  serviceId: string,
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { developer } = await requireServiceAccess(serviceId);
  const restrict = form.get("restrictLogin") === "on";
  const fields = { ...echo(form, "allowedEmails"), restrictLogin: restrict ? "on" : "" };

  const parsed = parseAllowlist(String(form.get("allowedEmails") ?? ""));
  if ("error" in parsed) return { error: parsed.error, fields };
  if (restrict && parsed.entries.length === 0) {
    return { error: "허용할 이메일이나 도메인을 하나 이상 입력하세요. 목록이 비어 있으면 아무도 로그인할 수 없어요.", fields };
  }

  await getPrisma().service.update({
    where: { id: serviceId },
    data: { restrictLogin: restrict, allowedEmails: parsed.entries },
  });

  await recordAudit(serviceId, developer, "access.update");

  revalidatePath(`/console/services/${serviceId}/settings`);
  return {
    message: restrict
      ? `저장했어요. 이제 허용 목록의 ${parsed.entries.length}개 항목만 로그인할 수 있어요.`
      : "저장했어요. 누구나 로그인할 수 있어요.",
  };
}

/** 상세 화면에서 지운 뒤에는 목록으로 이동한다 (지운 사용자 화면을 다시 그리지 않게) */
export async function deleteServiceUserFromDetail(serviceId: string, userId: string): Promise<ActionState> {
  const { developer, user } = await serviceUser(serviceId, userId);
  if (user) {
    await getPrisma().user.delete({ where: { id: user.id } });
    await recordAudit(serviceId, developer, "user.delete", user.email ?? user.id);
  }
  return { redirectTo: `/console/services/${serviceId}/users` };
}

/** 정지: 로그인, 토큰 갱신, userinfo를 막고 지금 세션과 토큰을 모두 끊는다. 해제하면 다시 로그인할 수 있다. */
export async function setUserDisabled(serviceId: string, userId: string, disabled: boolean): Promise<ActionState> {
  const { developer, user } = await serviceUser(serviceId, userId);
  if (!user) return { error: "이미 지워진 사용자예요. 목록으로 돌아가세요." };
  await getPrisma().user.update({ where: { id: user.id }, data: { disabledAt: disabled ? new Date() : null } });
  if (disabled) await endAllSessions(serviceId, user.id);
  await recordAudit(serviceId, developer, disabled ? "user.disable" : "user.enable", user.email ?? user.id);
  revalidatePath(`/console/services/${serviceId}/users/${userId}`);
  return { message: disabled ? "정지했어요. 이 사용자의 로그인과 토큰을 모두 끊었어요." : "정지를 풀었어요. 다시 로그인할 수 있어요." };
}

export async function revokeUserSessions(serviceId: string, userId: string): Promise<ActionState> {
  const { developer, user } = await serviceUser(serviceId, userId);
  if (!user) return { error: "이미 지워진 사용자예요. 목록으로 돌아가세요." };
  await endAllSessions(serviceId, user.id);
  await recordAudit(serviceId, developer, "user.sessions.revoke", user.email ?? user.id);
  revalidatePath(`/console/services/${serviceId}/users/${userId}`);
  return { message: "모든 기기의 로그인과 refresh token을 끊었어요. 다음 요청부터 다시 로그인해야 해요." };
}

/** 가입 설정과 약관 링크 */
export async function updateSignupSettings(serviceId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const { developer } = await requireServiceAccess(serviceId);
  const fields = echo(form, "termsUrl", "privacyUrl");

  const terms = parseOptionalHttpsUrl(form.get("termsUrl"), "이용약관");
  if ("error" in terms) return { error: terms.error, fields };
  const privacy = parseOptionalHttpsUrl(form.get("privacyUrl"), "개인정보 처리방침");
  if ("error" in privacy) return { error: privacy.error, fields };

  await getPrisma().service.update({
    where: { id: serviceId },
    data: {
      signupEnabled: form.get("signupEnabled") === "on",
      termsUrl: terms.url,
      privacyUrl: privacy.url,
    },
  });
  await recordAudit(serviceId, developer, "signup.update");
  revalidatePath(`/console/services/${serviceId}/settings`);
  return { message: "저장했어요." };
}
