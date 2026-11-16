// JWT 서명용 EC P-256 키를 만들어 JWK 한 줄로 출력한다.
// 사용: node scripts/generate-jwk.mjs
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("ES256", { extractable: true });
const jwk = await exportJWK(privateKey);
jwk.kid = await calculateJwkThumbprint(jwk);
jwk.alg = "ES256";

process.stdout.write(JSON.stringify(jwk) + "\n");
