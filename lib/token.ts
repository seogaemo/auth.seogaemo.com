import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  importJWK,
  jwtVerify,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTPayload,
} from "jose";

const ALG = "ES256";
const ISSUER = "https://auth.seogaemo.com";
const ACCESS_TOKEN_TTL = "1h";

export interface AccessTokenClaims extends JWTPayload {
  /** 서비스 안에서의 사용자 id */
  sub: string;
  /** 토큰을 받는 서비스의 client id */
  aud: string;
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

export async function signAccessToken(claims: AccessTokenClaims) {
  const { kid, privateKey } = await getSigningKeys();
  const { sub, aud, ...rest } = claims;

  return new SignJWT(rest)
    .setProtectedHeader({ alg: ALG, kid, typ: "at+jwt" })
    .setIssuer(ISSUER)
    .setSubject(sub)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(privateKey);
}

/** 서명, 만료, 발급자, (주어진 경우) audience를 검증한다. 실패하면 예외를 던진다. */
export async function verifyAccessToken(token: string, audience?: string) {
  const { publicKey } = await getSigningKeys();
  const { payload } = await jwtVerify<AccessTokenClaims>(token, publicKey, {
    issuer: ISSUER,
    audience,
    algorithms: [ALG],
  });

  return payload;
}

/** /.well-known/jwks.json 응답 */
export async function getJwks() {
  const { publicJwk } = await getSigningKeys();
  return { keys: [publicJwk] };
}
