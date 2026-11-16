interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;

  /** OIDC issuer (예: https://auth.seogaemo.com). wrangler.jsonc vars, 로컬은 .dev.vars */
  ISSUER: string;

  /** EC P-256 개인키 JWK (kid 포함). `wrangler secret put JWT_PRIVATE_JWK`로 등록한다. */
  JWT_PRIVATE_JWK: string;

  /** 비어 있으면 해당 로그인 수단은 꺼진 것으로 본다. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** 카카오 REST API 키 */
  KAKAO_CLIENT_ID?: string;
  /** 카카오 콘솔에서 Client Secret을 켠 경우에만 */
  KAKAO_CLIENT_SECRET?: string;
}
