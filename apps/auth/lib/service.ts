import type { Service } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { endpoint, isProvider, type Provider } from "./config";
import { hashSecret, timingSafeEqual } from "./crypto";
import { isWebUrl, parseUrl } from "./redirect-uri";

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function getRedirectUris(service: Service) {
  return stringArray(service.redirectUris);
}

export function getProviders(service: Service): Provider[] {
  return stringArray(service.providers).filter(isProvider);
}

export function getPostLogoutRedirectUris(service: Service) {
  return stringArray(service.postLogoutRedirectUris);
}

/** 루프백 IP 주소 (RFC 8252 7.3). localhost라는 이름은 포함하지 않는다 (8.3: 다른 곳을 가리킬 수 있다) */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);

/**
 * 네이티브 앱의 루프백 콜백(http://127.0.0.1:{포트}/callback)은 포트만 달라도 같은 주소로 본다.
 * 앱이 실행할 때마다 빈 포트를 고르기 때문이다 (RFC 8252 7.3).
 */
function sameLoopbackIgnoringPort(registered: string, requested: string) {
  const a = parseUrl(registered);
  const b = parseUrl(requested);
  if (!a || !b || a.protocol !== "http:" || b.protocol !== "http:") return false;
  if (!LOOPBACK_HOSTS.has(a.hostname) || a.hostname !== b.hostname) return false;
  // 포트를 뺀 나머지는 등록한 그대로여야 한다 (URL 정규화를 거치지 않은 원문으로 비교)
  const withoutPort = (raw: string, url: URL) => raw.replace(`${url.hostname}:${url.port}`, url.hostname);
  return withoutPort(registered, a) === withoutPort(requested, b);
}

/** 등록된 값과 문자 하나까지 같아야 한다 (RFC 6749 3.1.2, OAuth 2.1). 루프백 IP의 포트만 예외 */
export function isRegisteredRedirectUri(service: Service, redirectUri: string) {
  // 콘솔의 콜백 주소는 환경(로컬, 운영)마다 다르므로 issuer 기준으로 정한다
  if (service.isSystem) return redirectUri === endpoint("/console/callback");
  return getRedirectUris(service).some((r) => r === redirectUri || sameLoopbackIgnoringPort(r, redirectUri));
}

export function findServiceByClientId(clientId: string) {
  return getPrisma().service.findUnique({ where: { clientId } });
}

/** clientSecretHash가 비어 있으면 public client (SPA, 모바일). PKCE만으로 인증한다. */
export function isPublicClient(service: Service) {
  return service.clientSecretHash === "";
}

export async function verifyClientSecret(service: Service, secret: string) {
  if (isPublicClient(service)) return false;
  return timingSafeEqual(await hashSecret(secret), service.clientSecretHash);
}

/**
 * 로그아웃 뒤 돌아갈 주소. 등록한 "로그아웃 후 이동 주소"와 정확히 같아야 한다 (RP-Initiated Logout 3.1).
 * 경로가 비어 있는 웹 주소만 끝의 /를 같게 본다 (https://app.com 과 https://app.com/, RFC 3986 6.2.3).
 */
export function isAllowedPostLogoutUri(service: Service, uri: string) {
  const registered = service.isSystem ? [endpoint("/console")] : getPostLogoutRedirectUris(service);
  const bare = (value: string) => (/^https?:\/\/[^/?#]+\/$/.test(value) ? value.slice(0, -1) : value);
  return registered.some((r) => r === uri || bare(r) === bare(uri));
}

/** 등록된 첫 웹 Redirect URI의 origin (계정 화면, 로그아웃 화면의 "열기" 링크). 앱 스킴만 있으면 없다 */
export function serviceHomeUrl(service: Service) {
  if (service.isSystem) return endpoint("/console");
  const web = getRedirectUris(service).map(parseUrl).find((url) => url && isWebUrl(url));
  return web ? web.origin : null;
}
