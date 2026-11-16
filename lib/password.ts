import { base64url, timingSafeEqual } from "./crypto";

/**
 * PBKDF2-SHA256. Workers의 WebCrypto는 반복 횟수를 100,000까지만 허용한다.
 * 저장 형식: pbkdf2_sha256$<반복>$<salt base64url>$<hash base64url>
 */
const ITERATIONS = 100_000;
const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return base64url(bits);
}

function fromBase64url(value: string) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2_sha256$${ITERATIONS}$${base64url(salt)}$${await derive(password, salt, ITERATIONS)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2_sha256" || !iterations || !salt || !hash) return false;
  return timingSafeEqual(await derive(password, fromBase64url(salt), Number(iterations)), hash);
}

/** 계정이 없을 때도 비슷한 시간이 걸리게 해서 가입 여부를 응답 시간으로 알 수 없게 한다 */
export async function burnPasswordTime(password: string) {
  await derive(password, new Uint8Array(16), ITERATIONS);
}
