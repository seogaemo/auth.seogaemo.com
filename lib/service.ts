import type { Service } from "@prisma/client";

import { getPrisma } from "@/cloudflare";
import { isProvider, type Provider } from "./config";
import { hashSecret, timingSafeEqual } from "./crypto";

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
