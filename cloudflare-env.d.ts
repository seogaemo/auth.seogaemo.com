interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;

  /** EC P-256 개인키 JWK (kid 포함). `wrangler secret put JWT_PRIVATE_JWK`로 등록한다. */
  JWT_PRIVATE_JWK: string;
}
