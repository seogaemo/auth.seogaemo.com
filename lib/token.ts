import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
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
  const { publicKey } = await getSigningKeys();
  const { payload } = await jwtVerify<AccessTokenClaims>(token, publicKey, {
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
  const { publicKey } = await getSigningKeys();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: getIssuer(),
    audience: consoleAudience(),
    algorithms: [ALG],
    typ: CONSOLE_SESSION_TYP,
  });
  return payload.sub ?? null;
}

/** /.well-known/jwks.json 응답 */
export async function getJwks() {
  const { publicJwk } = await getSigningKeys();
  return { keys: [publicJwk] };
}
