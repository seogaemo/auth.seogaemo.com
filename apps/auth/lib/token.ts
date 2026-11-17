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

const ALG = "ES256";

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
  publicKey: CryptoKey;
  publicJwk: JWK;
}

let cached: { source: string; keys: Promise<SigningKeys> } | undefined;

/**
 * 서명 키는 JWT_PRIVATE_JWK 시크릿(EC P-256 개인키 JWK, kid 포함) 하나로 관리한다.
 * 공개키는 개인키 JWK에서 d를 뺀 값이다.
 */
function getSigningKeys() {
  const source = getCloudflareContext().env.JWT_PRIVATE_JWK;
  if (!source) {
    throw new Error("JWT_PRIVATE_JWK is not set");
  }

  if (cached && cached.source === source) {
    return cached.keys;
  }

  const keys = loadKeys(source);
  cached = { source, keys };
  return keys;
}

async function loadKeys(source: string): Promise<SigningKeys> {
  const jwk = JSON.parse(source) as JWK;
  if (!jwk.kid || !jwk.d) {
    throw new Error("JWT_PRIVATE_JWK must be a private JWK with kid");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { d, ...publicPart } = jwk;
  const publicJwk: JWK = {
    kty: publicPart.kty,
    crv: publicPart.crv,
    x: publicPart.x,
    y: publicPart.y,
    kid: jwk.kid,
    alg: ALG,
    use: "sig",
  };

  const [privateKey, publicKey] = await Promise.all([
    importJWK(jwk, ALG) as Promise<CryptoKey>,
    importJWK(publicJwk, ALG) as Promise<CryptoKey>,
  ]);

  return { kid: jwk.kid, privateKey, publicKey, publicJwk };
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
      .filter((k) => k.kid && k.kty === "EC")
      .map((k) => ({ kty: k.kty, crv: k.crv, x: k.x, y: k.y, kid: k.kid, alg: ALG, use: "sig" }));
  } catch {
    console.error("JWT_RETIRED_JWKS is not valid JSON");
    return [];
  }
}

async function publicKeys(): Promise<JWK[]> {
  const { publicJwk } = await getSigningKeys();
  return [publicJwk, ...retiredJwks().filter((k) => k.kid !== publicJwk.kid)];
}

async function keyResolver() {
  return createLocalJWKSet({ keys: await publicKeys() });
}

async function sign(
  { sub, aud, ...rest }: JWTPayload & { sub: string; aud: string },
  typ: string,
  expiresInSec: number = TTL.accessTokenSec,
) {
  const { kid, privateKey } = await getSigningKeys();

  return new SignJWT(rest)
    .setProtectedHeader({ alg: ALG, kid, typ })
    .setIssuer(getIssuer())
    .setSubject(sub)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`)
    .sign(privateKey);
}

export function signAccessToken(claims: AccessTokenClaims) {
  return sign(claims, "at+jwt");
}

export function signIdToken(claims: IdTokenClaims) {
  return sign(claims, "JWT");
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
      algorithms: [ALG],
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
