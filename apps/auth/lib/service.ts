import type { Service } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { endpoint, isProvider, type Provider } from "./config";
import { hashSecret, timingSafeEqual } from "./crypto";
import { isAppSchemeUrl, isWebUrl, parseUrl } from "./redirect-uri";

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function getRedirectUris(service: Service) {
  return stringArray(service.redirectUris);
}

export function getProviders(service: Service): Provider[] {
  return stringArray(service.providers).filter(isProvider);
}

/** 등록된 값과 문자 하나까지 같아야 한다 (RFC 6749 3.1.2, OAuth 2.1). */
export function isRegisteredRedirectUri(service: Service, redirectUri: string) {
  // 콘솔의 콜백 주소는 환경(로컬, 운영)마다 다르므로 issuer 기준으로 정한다
  if (service.isSystem) return redirectUri === endpoint("/console/callback");
  return getRedirectUris(service).includes(redirectUri);
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
 * 로그아웃 뒤 돌아갈 주소. 따로 등록받지 않고 등록된 Redirect URI로 판단한다.
 * - 웹: 등록된 웹 주소와 origin(스킴, 호스트, 포트)이 같으면
 * - 앱: 등록된 앱 스킴과 스킴이 같으면 (앱 스킴 주소는 origin이 모두 "null"이라 origin으로 비교하면 안 된다)
 * 남의 사이트나 다른 앱으로 보내는 열린 리다이렉트를 막는 데는 이것으로 충분하다.
 */
export function isAllowedPostLogoutUri(service: Service, uri: string) {
  const target = parseUrl(uri);
  if (!target || target.hash) return false;
  const registered = (service.isSystem ? [endpoint("/console/callback")] : getRedirectUris(service)).map(parseUrl);
  if (isWebUrl(target)) return registered.some((r) => r && isWebUrl(r) && r.origin === target.origin);
  if (isAppSchemeUrl(target)) return registered.some((r) => r && isAppSchemeUrl(r) && r.protocol === target.protocol);
  return false;
}

/** 등록된 첫 웹 Redirect URI의 origin (계정 화면, 로그아웃 화면의 "열기" 링크). 앱 스킴만 있으면 없다 */
export function serviceHomeUrl(service: Service) {
  if (service.isSystem) return endpoint("/console");
  const web = getRedirectUris(service).map(parseUrl).find((url) => url && isWebUrl(url));
  return web ? web.origin : null;
}
