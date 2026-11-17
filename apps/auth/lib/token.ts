import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createLocalJWKSet,
  errors,
  importJWK,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from "jose";

import { getIssuer, TTL } from "./config";

/** access token, 콘솔 세션은 항상 ES256. ID 토큰만 앱 설정에 따라 ES256이나 RS256 */
const ALG = "ES256";
export type IdTokenAlg = "ES256" | "RS256";
const ID_TOKEN_ALGS: IdTokenAlg[] = ["ES256", "RS256"];

export interface AccessTokenClaims extends JWTPayload {
  /** 서비스 안에서의 사용자 id */
  sub: string;
  /** 토큰을 받는 서비스의 client id */
  aud: string;
  /** 공백으로 구분한 scope */
  scope: string;
  client_id: string;
}

export interface IdTokenClaims extends JWTPayload {
  sub: string;
  aud: string;
  nonce?: string;
  /** 로그인 세션 id (RP-Initiated Logout의 id_token_hint로 돌아온다) */
  sid?: string;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

interface SigningKeys {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

const cached = new Map<IdTokenAlg, { source: string; keys: Promise<SigningKeys> }>();

/**
 * 서명 키는 알고리즘마다 시크릿 하나로 관리한다 (개인키 JWK, kid 포함).
 * - ES256: JWT_PRIVATE_JWK (EC P-256)
 * - RS256: JWT_RSA_PRIVATE_JWK (RSA 2048 이상). OIDC Discovery가 RS256 지원을 요구한다
 * 공개키는 개인키 JWK에서 비밀 부분을 뺀 값이다.
 */
function getSigningKeys(alg: IdTokenAlg = ALG) {
  const env = getCloudflareContext().env;
  const source = alg === "RS256" ? env.JWT_RSA_PRIVATE_JWK : env.JWT_PRIVATE_JWK;
  if (!source) {
    throw new Error(`${alg === "RS256" ? "JWT_RSA_PRIVATE_JWK" : "JWT_PRIVATE_JWK"} is not set`);
  }

  const hit = cached.get(alg);
  if (hit && hit.source === source) return hit.keys;

  const keys = loadKeys(source, alg);
  cached.set(alg, { source, keys });
  return keys;
}

/** 개인키 JWK에서 공개 부분만 (실수로 넣은 비밀 값을 내보내지 않게 필요한 필드만 고른다) */
function publicPart(jwk: JWK, alg: IdTokenAlg): JWK {
  const base = { kid: jwk.kid, alg, use: "sig" };
  return jwk.kty === "RSA" ? { kty: "RSA", n: jwk.n, e: jwk.e, ...base } : { kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y, ...base };
}

async function loadKeys(source: string, alg: IdTokenAlg): Promise<SigningKeys> {
  const jwk = JSON.parse(source) as JWK;
  if (!jwk.kid || !jwk.d) {
    throw new Error(`${alg} signing key must be a private JWK with kid`);
  }
  if ((alg === "RS256") !== (jwk.kty === "RSA")) throw new Error(`${alg} signing key has kty ${jwk.kty}`);

  const publicJwk = publicPart(jwk, alg);
  const privateKey = (await importJWK(jwk, alg)) as CryptoKey;
  return { kid: jwk.kid, privateKey, publicJwk };
}

/**
 * 검증에 쓰는 공개키들: 지금 서명 키 + 교체 전 키(JWT_RETIRED_JWKS, 공개 JWK 배열).
 * 키를 바꾼 뒤에도 이미 나간 토큰과 콘솔 세션이 만료될 때까지 통과하게 한다 (README "서명 키 교체").
 */
function retiredJwks(): JWK[] {
  const source = getCloudflareContext().env.JWT_RETIRED_JWKS;
  if (!source) return [];
  try {
    const parsed = JSON.parse(source) as JWK[] | { keys: JWK[] };
    const keys = Array.isArray(parsed) ? parsed : parsed.keys;
    // 공개 부분만 남긴다 (실수로 개인키를 넣어도 내보내지 않게)
    return keys
      .filter((k) => k.kid && (k.kty === "EC" || k.kty === "RSA"))
      .map((k) => publicPart(k, k.kty === "RSA" ? "RS256" : "ES256"));
  } catch {
    console.error("JWT_RETIRED_JWKS is not valid JSON");
    return [];
  }
}

/** RS256 키는 아직 설정 안 된 환경(로컬)도 있어서 없으면 빼고 내보낸다 */
async function currentPublicKeys(): Promise<JWK[]> {
  const keys = [(await getSigningKeys("ES256")).publicJwk];
  if (getCloudflareContext().env.JWT_RSA_PRIVATE_JWK) keys.push((await getSigningKeys("RS256")).publicJwk);
  return keys;
}

async function publicKeys(): Promise<JWK[]> {
  const current = await currentPublicKeys();
  const kids = new Set(current.map((k) => k.kid));
  return [...current, ...retiredJwks().filter((k) => !kids.has(k.kid))];
}

/** discovery의 id_token_signing_alg_values_supported */
export function idTokenAlgsSupported(): IdTokenAlg[] {
  return getCloudflareContext().env.JWT_RSA_PRIVATE_JWK ? ["RS256", "ES256"] : ["ES256"];
}

async function keyResolver() {
  return createLocalJWKSet({ keys: await publicKeys() });
}

async function sign(
  { sub, aud, ...rest }: JWTPayload & { sub: string; aud: string },
  typ: string,
  expiresInSec: number = TTL.accessTokenSec,
  alg: IdTokenAlg = ALG,
) {
  const { kid, privateKey } = await getSigningKeys(alg);

  return new SignJWT(rest)
    .setProtectedHeader({ alg, kid, typ })
    .setIssuer(getIssuer())
    .setSubject(sub)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(privateKey);
}

/** RFC 9068 JWT access token. jti는 토큰마다 다른 값이어야 한다 (2.2) */
export function signAccessToken(claims: Pick<AccessTokenClaims, "sub" | "aud" | "scope" | "client_id">) {
  return sign({ ...claims, jti: crypto.randomUUID() }, "at+jwt");
}

export function signIdToken(claims: IdTokenClaims, alg: IdTokenAlg) {
  return sign(claims, "JWT", TTL.accessTokenSec, alg);
}

/** 서명, 만료, 발급자, (주어진 경우) audience를 검증한다. 실패하면 예외를 던진다. */
export async function verifyAccessToken(token: string, audience?: string) {
  const { payload } = await jwtVerify<AccessTokenClaims>(token, await keyResolver(), {
    issuer: getIssuer(),
    audience,
    algorithms: [ALG],
    typ: "at+jwt",
  });

  return payload;
}

const CONSOLE_SESSION_TYP = "console-session+jwt";

function consoleAudience() {
  return `${getIssuer()}/console`;
}

/** 콘솔 로그인 세션 쿠키 값. sub는 시스템 서비스(콘솔)의 User id. */
export function signConsoleSession(userId: string) {
  return sign(
    { sub: userId, aud: consoleAudience() },
    CONSOLE_SESSION_TYP,
    TTL.consoleSessionSec,
  );
}

export async function verifyConsoleSession(token: string) {
  const { payload } = await jwtVerify(token, await keyResolver(), {
    issuer: getIssuer(),
    audience: consoleAudience(),
    algorithms: [ALG],
    typ: CONSOLE_SESSION_TYP,
  });
  return payload.sub ?? null;
}

/**
 * 로그아웃의 id_token_hint. 우리가 서명한 id_token이면 만료됐어도 받는다 (OIDC RP-Initiated Logout 2).
 * 아니면 null.
 */
export async function verifyIdTokenHint(token: string): Promise<IdTokenClaims | null> {
  try {
    const { payload } = await jwtVerify<IdTokenClaims>(token, await keyResolver(), {
      issuer: getIssuer(),
      algorithms: ID_TOKEN_ALGS,
      typ: "JWT",
    });
    return payload;
  } catch (error) {
    if (error instanceof errors.JWTExpired) return error.payload as IdTokenClaims;
    return null;
  }
}

/** /.well-known/jwks.json 응답 (교체 전 키도 함께) */
export async function getJwks() {
  return { keys: await publicKeys() };
}
