import { getCloudflareContext } from "@opennextjs/cloudflare";

import { clientInfo } from "./request";

/** Turnstile이 켜져 있으면 사이트 키. 키 두 개가 다 있어야 켜진다. */
export function turnstileSiteKey() {
  const env = getCloudflareContext().env;
  return env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY ? env.TURNSTILE_SITE_KEY : null;
}

/** 폼에 실려 온 Turnstile 토큰을 확인한다. 꺼져 있으면 항상 통과. */
export async function verifyTurnstile(form: FormData) {
  const secret = getCloudflareContext().env.TURNSTILE_SECRET_KEY;
  if (!secret || !turnstileSiteKey()) return true;

  const token = form.get("cf-turnstile-response");
  if (typeof token !== "string" || !token) return false;

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  const { ip } = await clientInfo();
  if (ip) body.set("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = (await res.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("turnstile verify failed", error);
    return false;
  }
}

export const TURNSTILE_MESSAGE = "사람인지 확인하지 못했어요. 아래 확인이 끝나면 다시 시도하세요.";
