import { base64UrlEncode, randomString, sha256 } from "./encoding.js";

export interface Pkce {
  /** 토큰 교환 때 보낸다. 로그인이 끝날 때까지 안전한 곳(세션, sessionStorage, Keychain)에 둔다. */
  verifier: string;
  /** authorize 요청에 보낸다 */
  challenge: string;
  method: "S256";
}

/**
 * PKCE (RFC 7636). verifier는 43~128자의 unreserved 문자, challenge는 BASE64URL(SHA256(verifier)).
 * plain 방식은 쓰지 않는다 (서버도 S256만 받는다).
 */
export async function createPkce(): Promise<Pkce> {
  const verifier = randomString(32);
  return { verifier, challenge: await pkceChallenge(verifier), method: "S256" };
}

export async function pkceChallenge(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) {
    throw new TypeError("code_verifier must be 43-128 unreserved characters (RFC 7636 4.1)");
  }
  return base64UrlEncode(await sha256(verifier));
}
