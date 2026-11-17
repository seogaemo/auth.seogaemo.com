// JWT 서명 키를 만들어 개인키 JWK 한 줄로 출력한다.
// 사용: node scripts/generate-jwk.mjs          (ES256, JWT_PRIVATE_JWK)
//       node scripts/generate-jwk.mjs --rsa    (RS256 2048bit, JWT_RSA_PRIVATE_JWK)
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";

const alg = process.argv.includes("--rsa") ? "RS256" : "ES256";
const { privateKey } = await generateKeyPair(alg, { extractable: true, ...(alg === "RS256" ? { modulusLength: 2048 } : {}) });
const jwk = await exportJWK(privateKey);
jwk.kid = await calculateJwkThumbprint(jwk);
jwk.alg = alg;

process.stdout.write(JSON.stringify(jwk) + "\n");
