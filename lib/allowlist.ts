import type { Service } from "@prisma/client";

/** 허용 목록에 넣을 수 있는 항목 수 */
export const MAX_ALLOWLIST_ENTRIES = 500;

/** 사용자가 이 서비스에 허용되지 않은 이메일로 로그인하려 할 때 보여주는 문구 */
export const NOT_ALLOWED_MESSAGE = "이 서비스에 로그인할 수 없는 이메일이에요. 서비스 운영자에게 문의하세요.";

const DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

export function getAllowlist(service: Pick<Service, "allowedEmails">): string[] {
  const value = service.allowedEmails;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * 이 이메일로 로그인할 수 있는지. 제한이 꺼져 있으면 누구나.
 * 제한이 켜져 있으면 확인된 이메일이 있어야 하고, 목록의 이메일과 같거나 도메인이 같아야 한다.
 * 도메인은 정확히 같을 때만 맞는다 (example.com은 sub.example.com을 포함하지 않는다).
 */
export function isEmailAllowed(
  service: Pick<Service, "restrictLogin" | "allowedEmails">,
  email: string | null | undefined,
) {
  if (!service.restrictLogin) return true;
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  return getAllowlist(service).some((entry) => entry === normalized || entry === domain);
}

/**
 * 줄마다(쉼표, 공백도 됨) 하나씩 받은 이메일, 도메인을 검사한다.
 * "@example.com"은 도메인 "example.com"으로 받는다.
 */
export function parseAllowlist(input: string): { entries: string[] } | { error: string } {
  const raw = input
    .split(/[\s,;]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .map((v) => (v.startsWith("@") ? v.slice(1) : v));
  const entries = [...new Set(raw)];

  if (entries.length > MAX_ALLOWLIST_ENTRIES) {
    return { error: `허용 목록은 ${MAX_ALLOWLIST_ENTRIES}개까지 넣을 수 있어요. 도메인으로 묶어 보세요.` };
  }
  for (const entry of entries) {
    const ok = entry.includes("@")
      ? EMAIL.test(entry) && DOMAIN.test(entry.slice(entry.lastIndexOf("@") + 1)) && entry.length <= 254
      : DOMAIN.test(entry);
    if (!ok) return { error: `name@example.com이나 example.com 형식으로 입력하세요: ${entry}` };
  }

  return { entries };
}
