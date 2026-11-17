/**
 * 쿠키에 넣을 값을 AES-GCM으로 암호화한다 (읽을 수도, 바꿀 수도 없게).
 * 키는 앱 비밀값에서 HKDF로 용도별로 뽑는다. WebCrypto만 써서 Node, Edge, Workers 어디서든 돈다.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const keys = new Map<string, Promise<CryptoKey>>();

function key(secret: string, purpose: string) {
  const id = `${purpose}\u0000${secret}`;
  let found = keys.get(id);
  if (!found) {
    found = crypto.subtle
      .importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: "HKDF", hash: "SHA-256", salt: encoder.encode("@seogaemo/oauth-next"), info: encoder.encode(purpose) },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      );
    keys.set(id, found);
  }
  return found;
}

export async function seal(value: unknown, secret: string, purpose: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret, purpose), data));
  return `${base64Url(iv)}.${base64Url(cipher)}`;
}

/** 위조, 다른 키, 다른 용도, 깨진 값이면 null */
export async function unseal<T>(sealed: string | undefined, secret: string, purpose: string): Promise<T | null> {
  if (!sealed) return null;
  const [iv, cipher] = sealed.split(".");
  if (!iv || !cipher) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv) }, await key(secret, purpose), fromBase64Url(cipher));
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}
