const encoder = new TextEncoder();

export function base64url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL에 그대로 넣을 수 있는 랜덤 문자열 (기본 32바이트 = 256bit) */
export function randomToken(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(input: string) {
  return crypto.subtle.digest("SHA-256", encoder.encode(input));
}

/** DB에 비밀값(코드, 토큰, 시크릿) 대신 저장하는 해시 */
export async function hashSecret(input: string) {
  const digest = new Uint8Array(await sha256(input));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string) {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** RFC 7636 S256: BASE64URL(SHA256(code_verifier)) === code_challenge */
export async function verifyPkce(verifier: string, challenge: string) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return timingSafeEqual(base64url(await sha256(verifier)), challenge);
}

export async function pkceChallenge(verifier: string) {
  return base64url(await sha256(verifier));
}
