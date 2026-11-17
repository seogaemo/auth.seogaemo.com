import { base64UrlDecode } from "./encoding.js";
import { ValidationError } from "./errors.js";
import type { FetchOptions, ServerMetadata } from "./metadata.js";

/** OIDC Core 2, 5.1 중 이 서버가 넣는 클레임 */
export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  auth_time?: number;
  nonce?: string;
  azp?: string;
  sid?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
  [key: string]: unknown;
}

interface JwsHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

type Algorithm = "ES256" | "RS256";

const WEBCRYPTO: Record<Algorithm, { import: EcKeyImportParams | RsaHashedImportParams; verify: AlgorithmIdentifier | EcdsaParams }> = {
  ES256: { import: { name: "ECDSA", namedCurve: "P-256" }, verify: { name: "ECDSA", hash: "SHA-256" } },
  RS256: { import: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, verify: { name: "RSASSA-PKCS1-v1_5" } },
};

export interface JsonWebKeySet {
  keys: (JsonWebKey & { kid?: string; alg?: string; use?: string })[];
}

/**
 * jwks_uri를 읽어 두고 kid로 키를 찾는다. 없는 kid가 오면 키가 바뀐 것일 수 있어 한 번 다시 읽는다.
 * 같은 서버에 여러 번 검증하면 인스턴스를 재사용한다 (createClient가 알아서 한다).
 */
export class RemoteJwks {
  private keys: JsonWebKeySet["keys"] | null = null;
  private fetchedAt = 0;

  constructor(
    readonly uri: string,
    private readonly options: FetchOptions & { /** 다시 읽기 최소 간격, 기본 60초 */ cooldownMs?: number } = {},
  ) {}

  private async load() {
    const response = await (this.options.fetch ?? fetch)(this.uri, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new ValidationError("invalid_metadata", `JWKS fetch failed: ${response.status}`);
    const set = (await response.json()) as JsonWebKeySet;
    if (!Array.isArray(set.keys)) throw new ValidationError("invalid_metadata", "JWKS has no keys");
    this.keys = set.keys;
    this.fetchedAt = Date.now();
  }

  async find(header: JwsHeader) {
    const pick = () =>
      this.keys?.find(
        (key) => (header.kid === undefined || key.kid === header.kid) && (key.alg === undefined || key.alg === header.alg) && key.use !== "enc",
      );
    if (!this.keys) await this.load();
    let key = pick();
    if (!key && Date.now() - this.fetchedAt > (this.options.cooldownMs ?? 60_000)) {
      await this.load();
      key = pick();
    }
    if (!key) throw new ValidationError("invalid_id_token", `no JWKS key for kid ${header.kid ?? "(none)"}`);
    return key;
  }
}

function decodeJson<T>(segment: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
  } catch {
    throw new ValidationError("invalid_id_token", "malformed JWT");
  }
}

export interface IdTokenCheck {
  clientId: string;
  /** authorize 요청에 보낸 nonce. 보냈으면 반드시 넘긴다 */
  nonce?: string;
  /** authorize 요청에 보낸 max_age (초). 넘기면 auth_time을 확인한다 */
  maxAge?: number;
  /** 허용할 서명 알고리즘. 기본은 서버 메타데이터의 값 중 ES256, RS256 */
  algorithms?: Algorithm[];
  /** 시계 오차 허용 (초), 기본 60 */
  clockTolerance?: number;
  /** 테스트용 현재 시각 (초) */
  now?: number;
}

/**
 * ID 토큰 검증 (OIDC Core 3.1.3.7).
 * 서명(JWKS), iss, aud, azp, exp, iat, nonce, auth_time을 확인하고 클레임을 돌려준다.
 * 토큰 엔드포인트에서 TLS로 직접 받은 토큰이라도 nonce와 aud 확인은 빼지 않는다.
 */
export async function verifyIdToken(
  idToken: string,
  metadata: Pick<ServerMetadata, "issuer" | "id_token_signing_alg_values_supported">,
  jwks: RemoteJwks,
  check: IdTokenCheck,
): Promise<IdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new ValidationError("invalid_id_token", "ID token must be a signed JWT (JWS compact)");
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeJson<JwsHeader>(headerPart);

  const supported = (metadata.id_token_signing_alg_values_supported ?? ["ES256", "RS256"]).filter((alg): alg is Algorithm => alg in WEBCRYPTO);
  const allowed = check.algorithms ?? supported;
  if (!allowed.includes(header.alg as Algorithm)) {
    // alg: none, HS256 혼동 공격을 여기서 막는다
    throw new ValidationError("invalid_id_token", `unexpected alg ${header.alg}`);
  }
  const alg = header.alg as Algorithm;

  const jwk = await jwks.find(header);
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("jwk", jwk, WEBCRYPTO[alg].import, false, ["verify"]);
  } catch {
    throw new ValidationError("invalid_id_token", `JWKS key ${jwk.kid ?? ""} does not fit ${alg}`);
  }
  const valid = await crypto.subtle.verify(
    WEBCRYPTO[alg].verify,
    key,
    base64UrlDecode(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) throw new ValidationError("invalid_id_token", "signature does not verify");

  const claims = decodeJson<IdTokenClaims>(payloadPart);
  const now = check.now ?? Math.floor(Date.now() / 1000);
  const tolerance = check.clockTolerance ?? 60;
  const fail = (message: string): never => {
    throw new ValidationError("invalid_id_token", message);
  };

  if (claims.iss !== metadata.issuer) fail(`iss ${claims.iss} does not match ${metadata.issuer}`);
  if (typeof claims.sub !== "string" || !claims.sub) fail("sub is missing");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(check.clientId)) fail("aud does not include this client");
  if (audiences.length > 1 && claims.azp === undefined) fail("azp is required when there are several audiences");
  if (claims.azp !== undefined && claims.azp !== check.clientId) fail("azp is not this client");
  if (typeof claims.exp !== "number" || claims.exp + tolerance <= now) fail("ID token has expired");
  if (typeof claims.iat !== "number" || claims.iat - tolerance > now) fail("iat is in the future");
  if (check.nonce !== undefined && claims.nonce !== check.nonce) fail("nonce does not match");
  if (check.maxAge !== undefined) {
    if (typeof claims.auth_time !== "number") fail("auth_time is required when max_age was sent");
    if (claims.auth_time! + check.maxAge + tolerance < now) fail("login is older than max_age");
  }
  return claims;
}
